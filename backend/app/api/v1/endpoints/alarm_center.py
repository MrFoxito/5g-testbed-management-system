import csv
import io
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.api.deps import current_user, operator_user
from app.models import UserPublic
from app.services import alarm_center as service
from app.services.scenarios import CATALOG

router = APIRouter(prefix='/alarm-center', tags=['alarm-center'])


def scope_for(scenario: str, user: UserPublic):
    if scenario not in CATALOG:
        raise HTTPException(404, 'Escenario no encontrado')
    # The deployed adapter is one shared testbed, not arbitrary per-user hosts.
    if user.testbed not in (None, 'local'):
        raise HTTPException(403, 'Este testbed no está asignado al usuario')
    return 'local'


def filters(view: Literal['active', 'history'] = 'active', search: str = Query('', max_length=120),
            component: str = Query('', max_length=80), severity: Literal['', 'critical', 'major', 'minor', 'warning'] = '',
            ack: Literal['', 'yes', 'no'] = '', visibility: Literal['all', 'visible', 'masked', 'silenced'] = 'all', state: Literal['', 'active', 'cleared'] = '',
            start: float | None = Query(None, ge=0), end: float | None = Query(None, ge=0)):
    if start is not None and end is not None and start > end:
        raise HTTPException(422, 'Rango de fechas inválido')
    return dict(view=view, search=search, component=component, severity=severity, ack=ack, visibility=visibility, state=state, start=start, end=end)


@router.get('/{scenario}')
def listing(scenario: str, options: dict = Depends(filters), page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=100), user: UserPublic = Depends(current_user)):
    return service.list_alarms(scope_for(scenario, user), scenario, **options, page=page, size=size)


@router.get('/{scenario}/export')
def export(scenario: str, options: dict = Depends(filters), user: UserPublic = Depends(current_user)):
    result = service.list_alarms(scope_for(scenario, user), scenario, **options, size=10001)
    if result['total'] > 10000:
        raise HTTPException(422, 'Acote los filtros: máximo 10000 incidentes por exportación')
    output = io.StringIO()
    keys = ['id', 'condition_key', 'severity', 'original_severity', 'state', 'network_function', 'node_id', 'message', 'first_seen', 'last_seen', 'cleared_at', 'duration_seconds', 'acknowledged_by', 'masked', 'silenced_until', 'evidence']
    writer = csv.writer(output)
    writer.writerow(keys)
    for item in result['items']:
        values = []
        for key in keys:
            value = item.get(key, '')
            if key in {'first_seen', 'last_seen', 'cleared_at', 'silenced_until'}:
                value = service.stamp(value) if value else ''
            text = str(value) if value is not None else ''
            if text.lstrip().startswith(('=', '+', '-', '@')): text = "'" + text
            values.append(text)
        writer.writerow(values)
    return Response('\ufeff' + output.getvalue(), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': f'attachment; filename="alarms-{scenario}-{options["view"]}.csv"'})


@router.get('/{scenario}/rules')
def rules(scenario: str, user: UserPublic = Depends(current_user)):
    return service.rules(scope_for(scenario, user), scenario)


class RuleUpdate(BaseModel):
    condition_key: str = Field(min_length=1, max_length=250)
    severity: Literal['critical', 'major', 'minor', 'warning'] | None = None
    masked: bool = False
    silence_minutes: int | None = Field(None, ge=0, le=10080)
    raise_seconds: int = Field(0, ge=0, le=600)
    clear_seconds: int = Field(0, ge=0, le=600)
    reason: str = Field(min_length=3, max_length=1000)


@router.put('/{scenario}/rules')
def update_rule(scenario: str, payload: RuleUpdate, user: UserPublic = Depends(operator_user)):
    scope = scope_for(scenario, user)
    if len(payload.reason.strip()) < 3:
        raise HTTPException(422, 'Ingrese el motivo del cambio')
    existing = next((r for r in service.rules(scope, scenario) if r['condition_key'] == payload.condition_key), None)
    if existing is None: raise HTTPException(404, 'Condición no encontrada')
    settings = {**existing['settings'], **payload.model_dump(exclude={'condition_key', 'silence_minutes', 'reason'})}
    if payload.silence_minutes is not None:
        settings['silenced_until'] = time.time() + payload.silence_minutes * 60 if payload.silence_minutes else 0
    service.save_rule(scope, scenario, payload.condition_key, settings, user.username, payload.reason.strip())
    return {'saved': True}


class Action(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)
    action: Literal['acknowledge', 'unacknowledge', 'comment']
    note: str = Field('', max_length=2000)


@router.post('/{scenario}/actions')
def operate(scenario: str, payload: Action, user: UserPublic = Depends(operator_user)):
    if payload.action == 'comment' and not payload.note.strip():
        raise HTTPException(422, 'Ingrese un comentario')
    try:
        service.action(scope_for(scenario, user), scenario, payload.ids, payload.action, user.username, payload.note.strip())
    except KeyError:
        raise HTTPException(404, 'Incidente no encontrado en el testbed')
    return {'saved': True}


@router.get('/{scenario}/events/{episode}')
def events(scenario: str, episode: str, user: UserPublic = Depends(current_user)):
    try:
        return service.timeline(scope_for(scenario, user), scenario, episode)
    except KeyError:
        raise HTTPException(404, 'Incidente no encontrado')

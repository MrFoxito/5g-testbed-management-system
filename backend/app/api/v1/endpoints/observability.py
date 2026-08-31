import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from app.api.deps import current_user, operator_user
from app.core.config import get_settings
from app.core.security import decode_token
from app.db import add_audit
from app.models import TraceStart, UserPublic
from app.services.observability import collect_alarms, metrics_service, trace_service
from app.services.scenarios import CATALOG, scenario_manager

router = APIRouter(tags=["observability"])


@router.get("/metrics")
def metrics(_: UserPublic = Depends(current_user)):
    return metrics_service.snapshot()


@router.get("/alarms/{scenario_id}")
async def alarms(scenario_id: str, _: UserPublic = Depends(current_user)):
    if scenario_id not in CATALOG:
        raise HTTPException(404, "Escenario no encontrado")
    return await collect_alarms(scenario_id)


@router.get("/alarms/{scenario_id}/history")
def alarm_history(scenario_id: str, _: UserPublic = Depends(current_user)):
    from app.db import get_alarm_history
    if scenario_id not in CATALOG:
        raise HTTPException(404, "Escenario no encontrado")
    return get_alarm_history(scenario_id)


@router.get("/logs/{scenario_id}/{component_id}")
async def logs(scenario_id: str, component_id: str, _: UserPublic = Depends(current_user)):
    if scenario_id not in CATALOG:
        raise HTTPException(404, "Escenario no encontrado")
    component = next((item for item in CATALOG[scenario_id]["components"] if item["id"] == component_id), None)
    if not component:
        raise HTTPException(404, "Componente no encontrado")
    return {"lines": await scenario_manager.adapter.logs(component["unit"])}


@router.get("/traces")
def traces(_: UserPublic = Depends(current_user)):
    return trace_service.list()


@router.post("/traces", status_code=201)
async def start_trace(payload: TraceStart, user: UserPublic = Depends(operator_user)):
    try:
        result = await trace_service.start(payload, user.username)
        add_audit(user.username, user.role, user.testbed, "trace.start", payload.model_dump(), "success")
        return result
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc))


@router.post("/traces/{trace_id}/stop")
async def stop_trace(trace_id: str, user: UserPublic = Depends(operator_user)):
    try:
        result = await trace_service.stop(trace_id)
        add_audit(user.username, user.role, user.testbed, "trace.stop", {"trace_id": trace_id}, "success")
        return result
    except KeyError:
        raise HTTPException(404, "Captura no encontrada")


@router.get("/traces/{trace_id}/download")
def download_trace(trace_id: str, _: UserPublic = Depends(current_user)):
    meta = next((item for item in trace_service.list() if item["id"] == trace_id), None)
    if not meta:
        raise HTTPException(404, "Captura no encontrada")
    path = (get_settings().capture_dir / meta["file"]).resolve()
    if not path.is_relative_to(get_settings().capture_dir.resolve()) or not path.exists():
        raise HTTPException(404, "Archivo no encontrado")
    return FileResponse(path, media_type="application/vnd.tcpdump.pcap", filename=meta["file"])


@router.websocket("/ws/live/{scenario_id}")
async def live(websocket: WebSocket, scenario_id: str, token: str):
    if scenario_id not in CATALOG:
        await websocket.close(code=4404)
        return
    try:
        decode_token(token)
    except Exception:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    try:
        while True:
            status = await scenario_manager.status(scenario_id)
            await websocket.send_text(json.dumps({
                "type": "snapshot",
                "scenario": status.model_dump(mode="json"),
                "metrics": metrics_service.snapshot(),
                "alarms": await collect_alarms(scenario_id),
            }))
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        return

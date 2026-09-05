from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import current_user, operator_user
from app.db import add_audit
from app.models import ConfigWrite, UserPublic
from app.services.configuration import ConfigurationError, configuration_service

router = APIRouter(prefix="/config", tags=["configuration"])


@router.get("/catalog/{scenario_id}")
def catalog(scenario_id: str, _: UserPublic = Depends(current_user)):
    try:
        return configuration_service.catalog(scenario_id)
    except KeyError:
        raise HTTPException(404, f"Escenario no encontrado: {scenario_id}")


@router.get("/declared")
async def read_declared(
    scenario_id: str,
    component_id: str,
    path: str,
    _: UserPublic = Depends(current_user),
):
    try:
        return await configuration_service.read_declared(scenario_id, component_id, path)
    except KeyError:
        raise HTTPException(404, f"Escenario no encontrado: {scenario_id}")
    except (FileNotFoundError, ConfigurationError) as exc:
        raise HTTPException(404 if isinstance(exc, FileNotFoundError) else 400, str(exc))


@router.get("/validate/{scenario_id}")
async def validate_scenario(scenario_id: str, _: UserPublic = Depends(current_user)):
    try:
        return await configuration_service.validate_scenario(scenario_id)
    except KeyError:
        raise HTTPException(404, f"Escenario no encontrado: {scenario_id}")
    except Exception as exc:
        raise HTTPException(500, f"Error durante la validación del escenario: {exc}")


@router.get("")
def read(path: str, _: UserPublic = Depends(current_user)):
    try:
        return {"path": path, "content": configuration_service.read(path)}
    except (FileNotFoundError, ConfigurationError) as exc:
        raise HTTPException(404 if isinstance(exc, FileNotFoundError) else 400, str(exc))


@router.post("/diff")
def diff(payload: ConfigWrite, _: UserPublic = Depends(current_user)):
    try:
        configuration_service.validate(payload.content)
        return {"diff": configuration_service.diff(payload.path, payload.content)}
    except ConfigurationError as exc:
        raise HTTPException(400, str(exc))


@router.put("")
def write(payload: ConfigWrite, user: UserPublic = Depends(operator_user)):
    try:
        result = configuration_service.write(payload.path, payload.content)
        add_audit(user.username, user.role, user.testbed, "config.write", {"path": payload.path}, "success")
        return result
    except ConfigurationError as exc:
        raise HTTPException(400, str(exc))


@router.post("/restore")
def restore(path: str, user: UserPublic = Depends(operator_user)):
    try:
        result = configuration_service.restore(path)
        add_audit(user.username, user.role, user.testbed, "config.restore", {"path": path}, "success")
        return result
    except (ConfigurationError, FileNotFoundError) as exc:
        raise HTTPException(400, str(exc))

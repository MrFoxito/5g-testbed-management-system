from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import current_user
from app.core.config import get_settings
from app.models import UserPublic
from app.services.vm_connectivity import connectivity

router = APIRouter(tags=["deployment"])


@router.get("/deployment")
def deployment(_: UserPublic = Depends(current_user)):
    settings = get_settings()
    return {"stage": settings.deployment_stage, "scenarios": settings.deployed_scenarios}


@router.get("/deployment/{scenario_id}/connectivity")
async def vm_connectivity(scenario_id: str, _: UserPublic = Depends(current_user)):
    if scenario_id not in {"4g-epc", "5g-sa"}:
        raise HTTPException(404, "Escenario no encontrado")
    return await connectivity(scenario_id)

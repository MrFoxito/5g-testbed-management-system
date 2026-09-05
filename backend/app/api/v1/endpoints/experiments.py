from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import current_user, operator_user
from app.db import add_audit
from app.models import UserPublic
from app.services.experiments import experiments_service

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("/catalog/{scenario_id}")
def get_catalog(scenario_id: str, _: UserPublic = Depends(current_user)):
    return experiments_service.catalog(scenario_id)


@router.post("/{experiment_id}/inject")
async def inject_fault(
    experiment_id: str,
    scenario_id: str = "5g-sa",
    user: UserPublic = Depends(operator_user),
):
    try:
        result = await experiments_service.inject(experiment_id, scenario_id)
        add_audit(
            user.username,
            user.role,
            user.testbed,
            "experiment.inject",
            {"experiment_id": experiment_id, "scenario_id": scenario_id},
            "success",
        )
        return result
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Error inyectando falla: {exc}")


@router.post("/{experiment_id}/recover")
async def recover_fault(
    experiment_id: str,
    scenario_id: str = "5g-sa",
    user: UserPublic = Depends(operator_user),
):
    try:
        result = await experiments_service.recover(experiment_id, scenario_id)
        add_audit(
            user.username,
            user.role,
            user.testbed,
            "experiment.recover",
            {"experiment_id": experiment_id, "scenario_id": scenario_id},
            "success",
        )
        return result
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Error recuperando falla: {exc}")

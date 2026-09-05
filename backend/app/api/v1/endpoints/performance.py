from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, model_validator

from app.api.deps import current_user, operator_user
from app.db import add_audit
from app.models import UserPublic
from app.services.performance import metrics_collector, performance_repository, performance_service


router = APIRouter(prefix="/performance", tags=["performance"])


class FolderCreate(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    scope: Literal["personal", "testbed"] = "personal"


class PerformanceQuery(BaseModel):
    scenario_id: Literal["5g-sa", "4g-epc"] = "5g-sa"
    object_ids: list[str] = Field(min_length=1, max_length=20)
    counter_ids: list[str] = Field(min_length=1, max_length=12)
    range_key: Literal["15m", "1h", "6h", "24h", "7d"] = "1h"
    start: datetime | None = None
    end: datetime | None = None
    granularity_seconds: int = Field(default=30, ge=5, le=86400)
    aggregation: Literal["avg", "min", "max", "sum", "last"] = "avg"

    @model_validator(mode="after")
    def valid_range(self):
        if self.start and self.end and self.start >= self.end:
            raise ValueError("La fecha inicial debe ser anterior a la final")
        return self


class SavedQueryCreate(PerformanceQuery):
    name: str = Field(min_length=3, max_length=80)
    folder_id: str | None = None
    scope: Literal["personal", "testbed"] = "personal"


@router.get("/catalog/{scenario_id}")
async def catalog(scenario_id: str, user: UserPublic = Depends(current_user)):
    try:
        return await performance_service.catalog(scenario_id, user)
    except KeyError:
        raise HTTPException(404, "Escenario no encontrado")


@router.get("/collector")
async def collector_status(_: UserPublic = Depends(current_user)):
    return {
        **performance_repository.status(),
        "running": bool(metrics_collector.task and not metrics_collector.task.done()),
    }


@router.post("/collect", status_code=202)
async def collect_now(user: UserPublic = Depends(operator_user)):
    count = await metrics_collector.collect_once()
    add_audit(user.username, user.role, user.testbed, "performance.collect", {"samples": count}, "success")
    return {"status": "completed", "inserted_samples": count}


@router.post("/query")
async def query(payload: PerformanceQuery, user: UserPublic = Depends(current_user)):
    try:
        return performance_service.query(payload.model_dump(), user)
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc))


@router.get("/folders")
async def folders(user: UserPublic = Depends(current_user)):
    return performance_repository.folders(user)


@router.post("/folders", status_code=201)
async def create_folder(payload: FolderCreate, user: UserPublic = Depends(current_user)):
    result = performance_repository.create_folder(name=payload.name.strip(), scope=payload.scope, user=user)
    add_audit(user.username, user.role, user.testbed, "performance.folder.create", {"folder_id": result["id"], "scope": payload.scope}, "success")
    return result


@router.get("/saved-queries")
async def saved_queries(user: UserPublic = Depends(current_user)):
    return performance_repository.queries(user)


@router.post("/saved-queries", status_code=201)
async def save_query(payload: SavedQueryCreate, user: UserPublic = Depends(current_user)):
    try:
        result = performance_repository.save_query(payload.model_dump(), user)
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    add_audit(user.username, user.role, user.testbed, "performance.query.save", {"query_id": result["id"], "scope": payload.scope}, "success")
    return result


@router.delete("/saved-queries/{query_id}", status_code=204)
async def delete_query(query_id: str, user: UserPublic = Depends(current_user)):
    try:
        performance_repository.delete_query(query_id, user)
    except KeyError:
        raise HTTPException(404, "Consulta no encontrada")
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    add_audit(user.username, user.role, user.testbed, "performance.query.delete", {"query_id": query_id}, "success")
    return Response(status_code=204)

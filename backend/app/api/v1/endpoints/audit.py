import json

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse

from app.api.deps import current_user, operator_user
from app.db import connection
from app.models import AuditEvent, UserPublic
from app.services.evidence import build_evidence_csv, build_evidence_package

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEvent])
def list_audit(limit: int = 100, _: UserPublic = Depends(operator_user)):
    with connection() as conn:
        rows = conn.execute("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 500),)).fetchall()
    return [{**dict(row), "parameters": json.loads(row["parameters"])} for row in rows]


@router.get("/evidence/{scenario_id}/json")
async def export_evidence_json(scenario_id: str, user: UserPublic = Depends(current_user)):
    try:
        pkg = await build_evidence_package(scenario_id, user)
        filename = f"evidencia_{scenario_id}_{pkg['testbed']['generated_at'][:10]}.json"
        return JSONResponse(
            content=pkg,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except KeyError:
        raise HTTPException(404, f"Escenario no encontrado: {scenario_id}")
    except Exception as exc:
        raise HTTPException(500, f"Error generando paquete de evidencia: {exc}")


@router.get("/evidence/{scenario_id}/csv")
async def export_evidence_csv(scenario_id: str, user: UserPublic = Depends(current_user)):
    try:
        csv_data = await build_evidence_csv(scenario_id, user)
        filename = f"evidencia_{scenario_id}.csv"
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except KeyError:
        raise HTTPException(404, f"Escenario no encontrado: {scenario_id}")
    except Exception as exc:
        raise HTTPException(500, f"Error generando CSV de evidencia: {exc}")

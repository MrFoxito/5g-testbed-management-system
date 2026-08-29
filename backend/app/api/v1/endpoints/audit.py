import json

from fastapi import APIRouter, Depends

from app.api.deps import operator_user
from app.db import connection
from app.models import AuditEvent, UserPublic

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEvent])
def list_audit(limit: int = 100, _: UserPublic = Depends(operator_user)):
    with connection() as conn:
        rows = conn.execute("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 500),)).fetchall()
    return [{**dict(row), "parameters": json.loads(row["parameters"])} for row in rows]

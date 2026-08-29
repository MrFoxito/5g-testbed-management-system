from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.deps import current_user, operator_user
from app.db import add_audit
from app.models import SubscriberCreate, UserPublic
from app.services.subscribers import subscriber_service

router = APIRouter(prefix="/subscribers", tags=["subscribers"])


@router.get("")
def list_subscribers(_: UserPublic = Depends(current_user)):
    return subscriber_service.list()


@router.post("", status_code=201)
def create(payload: SubscriberCreate, user: UserPublic = Depends(operator_user)):
    try:
        result = subscriber_service.create(payload)
        add_audit(user.username, user.role, user.testbed, "subscriber.create", {"imsi": payload.imsi}, "success")
        return result
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.delete("/{imsi}", status_code=204)
def delete(imsi: str, user: UserPublic = Depends(operator_user)):
    if not subscriber_service.delete(imsi):
        raise HTTPException(404, "Suscriptor no encontrado")
    add_audit(user.username, user.role, user.testbed, "subscriber.delete", {"imsi": imsi}, "success")
    return Response(status_code=204)

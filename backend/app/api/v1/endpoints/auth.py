from fastapi import APIRouter, HTTPException, status

from app.core.security import create_token, verify_password
from app.db import connection
from app.models import LoginRequest, TokenResponse, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    with connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (payload.username,)).fetchone()
    if not row or not row["enabled"] or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    user = UserPublic(username=row["username"], role=row["role"], testbed=row["testbed"])
    return TokenResponse(access_token=create_token(user.username, user.role.value), user=user)

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class Role(str, Enum):
    admin = "admin"
    teacher = "teacher"
    student = "student"


class ScenarioState(str, Enum):
    stopped = "stopped"
    deploying = "deploying"
    running = "running"
    degraded = "degraded"
    stopping = "stopping"
    failed = "failed"


class Severity(str, Enum):
    critical = "critical"
    major = "major"
    minor = "minor"
    warning = "warning"
    indeterminate = "indeterminate"
    cleared = "cleared"


class UserPublic(BaseModel):
    username: str
    role: Role
    testbed: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class ScenarioParameters(BaseModel):
    mcc: str = Field(pattern=r"^\d{3}$")
    mnc: str = Field(pattern=r"^\d{2,3}$")
    tac: int = Field(ge=1, le=16_777_215)
    apn_dnn: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9.-]+$")
    sst: int | None = Field(default=None, ge=0, le=255)
    sd: str | None = Field(default=None, pattern=r"^[0-9A-Fa-f]{6}$")


class ScenarioAction(BaseModel):
    parameters: ScenarioParameters
    testbed: str = "local"


class ComponentStatus(BaseModel):
    id: str
    label: str
    kind: str
    status: str
    depends_on: list[str] = []


class ScenarioStatus(BaseModel):
    scenario_id: str
    state: ScenarioState
    components: list[ComponentStatus]
    updated_at: datetime
    message: str | None = None


class ConfigWrite(BaseModel):
    path: str
    content: str


class SubscriberCreate(BaseModel):
    imsi: str = Field(pattern=r"^\d{14,15}$")
    key: str = Field(min_length=32, max_length=32, pattern=r"^[0-9A-Fa-f]+$")
    opc: str = Field(min_length=32, max_length=32, pattern=r"^[0-9A-Fa-f]+$")
    amf: str = Field(default="8000", pattern=r"^[0-9A-Fa-f]{4}$")
    apn_dnn: str = Field(default="internet", pattern=r"^[a-zA-Z0-9.-]+$")
    sst: int = Field(default=1, ge=0, le=255)
    sd: str | None = Field(default=None, pattern=r"^[0-9A-Fa-f]{6}$")

    @field_validator("key", "opc", "amf", "sd")
    @classmethod
    def uppercase_hex(cls, value):
        return value.upper() if value else value


class TraceStart(BaseModel):
    interface: str
    protocol: str
    duration_seconds: int = Field(default=60, ge=5, le=300)
    max_megabytes: int = Field(default=25, ge=1, le=100)


class AuditEvent(BaseModel):
    id: int
    username: str
    role: str
    testbed: str | None
    action: str
    parameters: dict[str, Any]
    result: str
    created_at: datetime

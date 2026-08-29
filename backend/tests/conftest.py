import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ["EMS_EXECUTION_MODE"] = "simulated"
os.environ["EMS_DATABASE_PATH"] = str(Path("./data/test-ems.db"))
os.environ["EMS_ALLOWED_CONFIG_ROOTS"] = '["./data/test-config"]'

from app.core.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    get_settings.cache_clear()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def teacher_headers(client):
    response = client.post("/api/v1/auth/login", json={"username": "docente", "password": "teacher-change-me"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def student_headers(client):
    response = client.post("/api/v1/auth/login", json={"username": "alumno", "password": "student-change-me"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}

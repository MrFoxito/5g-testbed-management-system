import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.security import hash_password


def connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_settings().database_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def transaction():
    conn = connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize() -> None:
    with transaction() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              username TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
              role TEXT NOT NULL, testbed TEXT, enabled INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS audit_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
              role TEXT NOT NULL, testbed TEXT, action TEXT NOT NULL,
              parameters TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scenario_states (
              scenario_id TEXT PRIMARY KEY, state TEXT NOT NULL,
              parameters TEXT NOT NULL, message TEXT, updated_at TEXT NOT NULL
            );
            """
        )
        users = [
            ("admin", "admin-change-me", "admin", None),
            ("docente", "teacher-change-me", "teacher", None),
            ("alumno", "student-change-me", "student", "local"),
        ]
        for username, password, role, testbed in users:
            conn.execute(
                "INSERT OR IGNORE INTO users(username,password_hash,role,testbed) VALUES(?,?,?,?)",
                (username, hash_password(password), role, testbed),
            )


def add_audit(username: str, role: str, testbed: str | None, action: str, parameters: dict, result: str) -> None:
    safe = {key: value for key, value in parameters.items() if key.lower() not in {"key", "opc", "op", "password", "secret"}}
    with transaction() as conn:
        conn.execute(
            "INSERT INTO audit_events(username,role,testbed,action,parameters,result,created_at) VALUES(?,?,?,?,?,?,?)",
            (username, role, testbed, action, json.dumps(safe), result, datetime.now(timezone.utc).isoformat()),
        )

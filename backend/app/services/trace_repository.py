from __future__ import annotations

import json
from typing import Any

from app.db import connection, transaction


JSON_COLUMNS = {
    "procedures",
    "interfaces_3gpp",
    "protocols",
    "protocol_summary",
}
BOOLEAN_COLUMNS = {"include_user_plane", "include_sbi", "auto_trigger"}

TASK_COLUMNS = {
    "id",
    "name",
    "trace_type",
    "scenario_id",
    "testbed_id",
    "owner",
    "owner_role",
    "capture_agent_id",
    "capture_host",
    "node_id",
    "component_id",
    "capture_point",
    "selector_kind",
    "selector_hash",
    "selector_masked",
    "procedures",
    "interfaces_3gpp",
    "protocols",
    "include_user_plane",
    "include_sbi",
    "auto_trigger",
    "duration_seconds",
    "max_megabytes",
    "status",
    "result",
    "source",
    "device",
    "filter_profile",
    "pcap_file",
    "filtered_file",
    "analysis_file",
    "pid",
    "remote_path",
    "remote_log",
    "packet_count",
    "size_bytes",
    "protocol_summary",
    "message",
    "created_at",
    "started_at",
    "completed_at",
}


def _encode(column: str, value: Any) -> Any:
    if column in JSON_COLUMNS:
        return json.dumps(value, ensure_ascii=False)
    if column in BOOLEAN_COLUMNS:
        return int(bool(value))
    return value


def _task_from_row(row) -> dict[str, Any]:
    item = dict(row)
    for column in JSON_COLUMNS:
        try:
            item[column] = json.loads(item.get(column) or "[]")
        except json.JSONDecodeError:
            item[column] = []
    for column in BOOLEAN_COLUMNS:
        item[column] = bool(item.get(column))
    return item


class TraceRepository:
    def create(self, task: dict[str, Any]) -> dict[str, Any]:
        columns = [column for column in TASK_COLUMNS if column in task]
        values = [_encode(column, task[column]) for column in columns]
        placeholders = ",".join("?" for _ in columns)
        with transaction() as conn:
            conn.execute(
                f"INSERT INTO trace_tasks({','.join(columns)}) VALUES({placeholders})",
                values,
            )
        return self.get(task["id"])

    def update(self, task_id: str, **changes: Any) -> dict[str, Any]:
        invalid = set(changes) - TASK_COLUMNS
        if invalid:
            raise ValueError(f"Columnas de tarea no permitidas: {sorted(invalid)}")
        if not changes:
            return self.get(task_id)
        assignments = ",".join(f"{column}=?" for column in changes)
        values = [_encode(column, value) for column, value in changes.items()]
        with transaction() as conn:
            cursor = conn.execute(
                f"UPDATE trace_tasks SET {assignments} WHERE id=?",
                [*values, task_id],
            )
            if cursor.rowcount != 1:
                raise KeyError(task_id)
        return self.get(task_id)

    def get(self, task_id: str) -> dict[str, Any]:
        with connection() as conn:
            row = conn.execute("SELECT * FROM trace_tasks WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise KeyError(task_id)
        return _task_from_row(row)

    def list(
        self,
        *,
        owner: str | None = None,
        scenario_id: str | None = None,
        trace_type: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        values: list[Any] = []
        for column, value in (
            ("owner", owner),
            ("scenario_id", scenario_id),
            ("trace_type", trace_type),
            ("status", status),
        ):
            if value:
                clauses.append(f"{column}=?")
                values.append(value)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        with connection() as conn:
            rows = conn.execute(
                f"SELECT * FROM trace_tasks{where} ORDER BY created_at DESC",
                values,
            ).fetchall()
        return [_task_from_row(row) for row in rows]

    def count_active(self, owner: str, testbed_id: str) -> int:
        with connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS total FROM trace_tasks "
                "WHERE owner=? AND testbed_id=? "
                "AND status IN ('queued','preparing','running','processing')",
                (owner, testbed_id),
            ).fetchone()
        return int(row["total"])

    def replace_events(self, task_id: str, events: list[dict[str, Any]]) -> None:
        with transaction() as conn:
            conn.execute("DELETE FROM trace_events WHERE task_id=?", (task_id,))
            conn.executemany(
                "INSERT INTO trace_events("
                "task_id,event_id,ordinal,timestamp,relative_ms,source_nf,target_nf,"
                "interface_3gpp,protocol,message,procedure,status,packet_number,"
                "evidence_type,identifiers) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [
                    (
                        task_id,
                        event["id"],
                        event["ordinal"],
                        event["timestamp"],
                        event["relative_ms"],
                        event["source_nf"],
                        event["target_nf"],
                        event["interface_3gpp"],
                        event["protocol"],
                        event["message"],
                        event["procedure"],
                        event["status"],
                        event.get("packet_number"),
                        event["evidence_type"],
                        json.dumps(event.get("identifiers", []), ensure_ascii=False),
                    )
                    for event in events
                ],
            )

    def events(self, task_id: str) -> list[dict[str, Any]]:
        with connection() as conn:
            rows = conn.execute(
                "SELECT * FROM trace_events WHERE task_id=? ORDER BY ordinal",
                (task_id,),
            ).fetchall()
        events = []
        for row in rows:
            event = dict(row)
            event.pop("task_id", None)
            event["identifiers"] = json.loads(event.get("identifiers") or "[]")
            events.append(event)
        return events

    def delete(self, task_id: str) -> dict[str, Any]:
        task = self.get(task_id)
        with transaction() as conn:
            conn.execute("DELETE FROM trace_events WHERE task_id=?", (task_id,))
            conn.execute("DELETE FROM trace_tasks WHERE id=?", (task_id,))
        return task


trace_repository = TraceRepository()

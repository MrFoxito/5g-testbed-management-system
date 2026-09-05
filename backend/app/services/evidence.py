import asyncio
import csv
import io
import json
from datetime import datetime, timezone

from app.db import connection
from app.models import Role, UserPublic
from app.services.configuration import configuration_service
from app.services.observability import collect_alarms, metrics_service, trace_service
from app.services.scenarios import CATALOG, scenario_manager


async def build_evidence_package(scenario_id: str, user: UserPublic) -> dict:
    if scenario_id not in CATALOG:
        raise KeyError(scenario_id)

    scenario_info = CATALOG[scenario_id]
    status = await scenario_manager.status(scenario_id)
    runtime = await scenario_manager.adapter.runtime_snapshot()
    alarms = await collect_alarms(scenario_id)
    traces = await trace_service.list(user, scenario_id=scenario_id)
    validation = await configuration_service.validate_scenario(scenario_id)
    metrics = await metrics_service.snapshot(scenario_id)

    with connection() as conn:
        if user.role == Role.student:
            rows = conn.execute(
                "SELECT * FROM audit_events WHERE username=? ORDER BY id DESC LIMIT 50",
                (user.username,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM audit_events ORDER BY id DESC LIMIT 50").fetchall()
    audit_events = [{**dict(r), "parameters": json.loads(r["parameters"])} for r in rows]

    return {
        "testbed": {
            "scenario_id": scenario_id,
            "name": scenario_info.get("name"),
            "technology": scenario_info.get("technology"),
            "state": status.state,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "components": [
                {
                    "id": c.id,
                    "label": c.label,
                    "kind": c.kind,
                    "status": c.status,
                    "node_id": c.node_id,
                    "interfaces": c.interfaces,
                    "procedures": c.procedures,
                }
                for c in status.components
            ],
        },
        "runtime": {
            "source": runtime.get("source"),
            "hostname": runtime.get("hostname"),
            "interfaces": runtime.get("interfaces", []),
            "listening_ports_count": len(runtime.get("listening_ports", [])),
        },
        "telco_validation": {
            "summary": validation.get("summary"),
            "checks": validation.get("checks", []),
            "baseline_diff": validation.get("baseline_diff", ""),
        },
        "alarms": alarms,
        "traces": [
            {
                "id": t.get("id"),
                "name": t.get("name"),
                "trace_type": t.get("trace_type"),
                "capture_point": t.get("capture_point"),
                "interfaces_3gpp": t.get("interfaces_3gpp"),
                "protocols": t.get("protocols"),
                "status": t.get("status"),
                "result": t.get("result"),
                "packet_count": t.get("packet_count"),
                "size_bytes": t.get("size_bytes"),
                "target": t.get("target"),
            }
            for t in traces
            if t.get("scenario_id") == scenario_id
        ],
        "kpis": {
            "source": metrics.get("source"),
            "cpu_percent": metrics.get("cpu_percent"),
            "memory_percent": metrics.get("memory_percent"),
            "telco": metrics.get("telco"),
            "interfaces": metrics.get("interfaces"),
        },
        "audit_events": audit_events,
    }


async def build_evidence_csv(scenario_id: str, user: UserPublic) -> str:
    pkg = await build_evidence_package(scenario_id, user)
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["SECCION", "CAMPO_1", "CAMPO_2", "CAMPO_3", "CAMPO_4", "ESTADO"])

    # Testbed Info
    writer.writerow(["TESTBED", scenario_id, pkg["testbed"]["name"], pkg["testbed"]["technology"], "", pkg["testbed"]["state"]])

    # Components
    for c in pkg["testbed"]["components"]:
        writer.writerow(["COMPONENTE", c["id"], c["label"], c["kind"], "/".join(c["interfaces"]), c["status"]])

    # Alarms
    for a in pkg["alarms"]:
        writer.writerow(["ALARMA", a.get("component"), a.get("severity"), a.get("message"), a.get("evidence"), a.get("state")])

    # Validations
    for v in pkg["telco_validation"]["checks"]:
        writer.writerow(["VALIDACION", v.get("category"), v.get("title"), v.get("evidence"), ",".join(v.get("components", [])), v.get("status")])

    # Traces
    for t in pkg["traces"]:
        writer.writerow([
            "CAPTURA",
            t.get("name"),
            t.get("trace_type"),
            f"{t.get('packet_count', 0)} pkts",
            "/".join(t.get("interfaces_3gpp") or []),
            t.get("result") or t.get("status"),
        ])

    return output.getvalue()

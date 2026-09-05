"""Prueba manual segura de Subscriber Trace contra la VM real.

Ejecutar desde ``Code/backend`` con la VM activa y ``.env`` configurado::

    .venv/Scripts/python.exe tests/manual_remote_trace.py

La prueba inicia la captura, fuerza un registro nuevo y restaura gNB/UE en un
bloque ``finally``. Los artefactos se conservan para inspección.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import Role, SubscriberTraceStart, UserPublic
from app.services.scenarios import scenario_manager
from app.services.trace_tasks import TERMINAL_STATES, trace_task_service


async def ensure_radio_chain() -> None:
    """Leave the demonstrator usable even if capture or traffic generation fails."""
    await scenario_manager.start_component("5g-sa", "gnb")
    await asyncio.sleep(1)
    await scenario_manager.start_component("5g-sa", "ue")


async def main() -> None:
    user = UserPublic(username="integration-test", role=Role.teacher, testbed="local")
    request = SubscriberTraceStart(
        name="Validación manual E2E",
        scenario_id="5g-sa",
        testbed_id="local",
        capture_agent_id="primary",
        identifier_type="imsi",
        identifier="999700000000001",
        procedures=["registration", "authentication", "pdu-session", "user-plane"],
        include_user_plane=True,
        include_sbi=True,
        auto_trigger=False,
        duration_seconds=15,
        max_megabytes=5,
    )

    created = await trace_task_service.create_subscriber(request, user)
    try:
        await scenario_manager.stop_component("5g-sa", "ue")
        await asyncio.sleep(1)
        await scenario_manager.start_component("5g-sa", "ue")
        await asyncio.sleep(4)
        try:
            await scenario_manager.adapter.generate_test_traffic(3)
        except Exception as exc:
            print(f"Aviso: no se pudo generar tráfico N6: {exc}", file=sys.stderr)

        task = created
        for _ in range(25):
            await asyncio.sleep(1)
            task = await trace_task_service.get(created["id"], user)
            if task["status"] in TERMINAL_STATES:
                break
        if task["status"] not in TERMINAL_STATES:
            task = await trace_task_service.stop(created["id"], user)

        analysis = await trace_task_service.analysis(created["id"], user)
        result = {
            "id": task["id"],
            "status": task["status"],
            "result": task.get("result"),
            "packet_count": task.get("packet_count"),
            "size_bytes": task.get("size_bytes"),
            "target": analysis.get("target"),
            "correlation_status": analysis.get("correlation_status"),
            "identifier_kinds": [item["kind"] for item in analysis.get("identifiers", [])],
            "procedures": analysis.get("procedures", []),
            "artifacts": task.get("artifacts", []),
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if task["status"] != "completed" or not analysis.get("events"):
            raise SystemExit(1)
    finally:
        await ensure_radio_chain()


if __name__ == "__main__":
    asyncio.run(main())

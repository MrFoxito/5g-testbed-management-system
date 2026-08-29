import asyncio
import json
from datetime import datetime, timezone

from app.db import transaction
from app.models import ComponentStatus, ScenarioAction, ScenarioState, ScenarioStatus
from app.services.execution import ExecutionAdapter, build_adapter


CATALOG = {
    "4g-epc": {
        "name": "4G EPC educativo",
        "technology": "4G",
        "components": [
            {"id": "mongodb", "label": "MongoDB", "kind": "database", "unit": "mongod", "depends_on": []},
            {"id": "hss", "label": "HSS", "kind": "core", "unit": "open5gs-hssd", "depends_on": ["mongodb"]},
            {"id": "pcrf", "label": "PCRF", "kind": "core", "unit": "open5gs-pcrfd", "depends_on": ["mongodb"]},
            {"id": "sgwc", "label": "SGW-C", "kind": "core", "unit": "open5gs-sgwcd", "depends_on": []},
            {"id": "sgwu", "label": "SGW-U", "kind": "user-plane", "unit": "open5gs-sgwud", "depends_on": ["sgwc"]},
            {"id": "smf", "label": "PGW-C/SMF", "kind": "core", "unit": "open5gs-smfd", "depends_on": ["pcrf"]},
            {"id": "upf", "label": "PGW-U/UPF", "kind": "user-plane", "unit": "open5gs-upfd", "depends_on": ["smf"]},
            {"id": "mme", "label": "MME", "kind": "core", "unit": "open5gs-mmed", "depends_on": ["hss", "sgwc"]},
            {"id": "enb", "label": "eNodeB", "kind": "ran", "unit": "srsenb", "depends_on": ["mme", "upf"]},
            {"id": "ue", "label": "UE", "kind": "ue", "unit": "srsue", "depends_on": ["enb"]},
        ],
        "defaults": {"mcc": "716", "mnc": "10", "tac": 1, "apn_dnn": "internet"},
    },
    "5g-sa": {
        "name": "5G Standalone educativo",
        "technology": "5G",
        "components": [
            {"id": "mongodb", "label": "MongoDB", "kind": "database", "unit": "mongod", "depends_on": []},
            {"id": "nrf", "label": "NRF", "kind": "core", "unit": "open5gs-nrfd", "depends_on": []},
            {"id": "udr", "label": "UDR", "kind": "core", "unit": "open5gs-udrd", "depends_on": ["mongodb", "nrf"]},
            {"id": "udm", "label": "UDM", "kind": "core", "unit": "open5gs-udmd", "depends_on": ["udr", "nrf"]},
            {"id": "ausf", "label": "AUSF", "kind": "core", "unit": "open5gs-ausfd", "depends_on": ["udm", "nrf"]},
            {"id": "pcf", "label": "PCF", "kind": "core", "unit": "open5gs-pcfd", "depends_on": ["mongodb", "nrf"]},
            {"id": "nssf", "label": "NSSF", "kind": "core", "unit": "open5gs-nssfd", "depends_on": ["nrf"]},
            {"id": "smf", "label": "SMF", "kind": "core", "unit": "open5gs-smfd", "depends_on": ["nrf", "pcf"]},
            {"id": "upf", "label": "UPF", "kind": "user-plane", "unit": "open5gs-upfd", "depends_on": ["smf"]},
            {"id": "amf", "label": "AMF", "kind": "core", "unit": "open5gs-amfd", "depends_on": ["nrf", "ausf", "nssf"]},
            {"id": "gnb", "label": "gNodeB (UERANSIM)", "kind": "ran", "unit": "ueransim-gnb", "depends_on": ["amf", "upf"]},
            {"id": "ue", "label": "UE (UERANSIM)", "kind": "ue", "unit": "ueransim-ue", "depends_on": ["gnb"]},
        ],
        "defaults": {"mcc": "999", "mnc": "70", "tac": 1, "apn_dnn": "internet", "sst": 1, "sd": "ffffff"},
    },
}


class ScenarioManager:
    def __init__(self) -> None:
        units = {component["unit"] for scenario in CATALOG.values() for component in scenario["components"]}
        self.adapter: ExecutionAdapter = build_adapter(units)
        self.locks = {scenario_id: asyncio.Lock() for scenario_id in CATALOG}

    def list_catalog(self) -> list[dict]:
        return [{"id": key, **value} for key, value in CATALOG.items()]

    def _persist(self, scenario_id: str, state: ScenarioState, parameters: dict, message: str | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with transaction() as conn:
            conn.execute(
                "INSERT INTO scenario_states VALUES(?,?,?,?,?) ON CONFLICT(scenario_id) DO UPDATE SET state=excluded.state,parameters=excluded.parameters,message=excluded.message,updated_at=excluded.updated_at",
                (scenario_id, state.value, json.dumps(parameters), message, now),
            )

    async def status(self, scenario_id: str) -> ScenarioStatus:
        scenario = CATALOG[scenario_id]
        components = []
        for item in scenario["components"]:
            components.append(ComponentStatus(
                id=item["id"], label=item["label"], kind=item["kind"],
                status=await self.adapter.service_status(item["unit"]), depends_on=item["depends_on"]
            ))
        running = sum(item.status == "running" for item in components)
        state = ScenarioState.running if running == len(components) else ScenarioState.stopped if running == 0 else ScenarioState.degraded
        return ScenarioStatus(scenario_id=scenario_id, state=state, components=components, updated_at=datetime.now(timezone.utc))

    async def start(self, scenario_id: str, action: ScenarioAction) -> ScenarioStatus:
        async with self.locks[scenario_id]:
            self._persist(scenario_id, ScenarioState.deploying, action.parameters.model_dump())
            started = []
            try:
                for component in CATALOG[scenario_id]["components"]:
                    await self.adapter.start_service(component["unit"])
                    started.append(component)
                self._persist(scenario_id, ScenarioState.running, action.parameters.model_dump())
            except Exception as exc:
                for component in reversed(started):
                    await self.adapter.stop_service(component["unit"])
                self._persist(scenario_id, ScenarioState.failed, action.parameters.model_dump(), str(exc))
                raise
            return await self.status(scenario_id)

    async def stop(self, scenario_id: str) -> ScenarioStatus:
        async with self.locks[scenario_id]:
            self._persist(scenario_id, ScenarioState.stopping, {})
            for component in reversed(CATALOG[scenario_id]["components"]):
                await self.adapter.stop_service(component["unit"])
            self._persist(scenario_id, ScenarioState.stopped, {})
            return await self.status(scenario_id)


scenario_manager = ScenarioManager()

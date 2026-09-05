import asyncio
import time
from datetime import datetime, timezone
from typing import Any

from app.services.scenarios import scenario_manager

EXPERIMENT_CATALOG = [
    {
        "id": "5g-f03",
        "scenario_id": "5g-sa",
        "title": "5G-F03: Caída de Función de Red del Core (AMF)",
        "category": "core-availability",
        "severity": "critical",
        "target_nf": "amf",
        "interfaces": ["N1", "N2"],
        "procedures": ["Registration", "NGAP Association"],
        "description": "Detiene el servicio open5gs-amfd para provocar una interrupción total del plano de control en N2/SCTP 38412.",
        "expected_detection": "< 5 segundos (alarma crítica y pérdida de socket SCTP)",
        "recovery_action": "Reinicia el servicio systemd de AMF y restaura la asociación NGAP.",
    },
    {
        "id": "ops-f01",
        "scenario_id": "5g-sa",
        "title": "OPS-F01: Aislamiento de Tráfico en Plano de Usuario (N6)",
        "category": "host-network",
        "severity": "critical",
        "target_nf": "upf",
        "interfaces": ["N6"],
        "procedures": ["User Plane Forwarding", "Internet Access"],
        "description": "Desactiva net.ipv4.ip_forward en Linux. El plano de control permanece UP pero el tráfico de datos del UE sufre 100% de pérdida.",
        "expected_detection": "< 5 segundos (falla en ping ICMP y alarma crítica de reenvío N6)",
        "recovery_action": "Restablece net.ipv4.ip_forward=1 en el host Linux.",
    },
    {
        "id": "5g-f01",
        "scenario_id": "5g-sa",
        "title": "5G-F01: Falla de Autenticación / SUPI no provisionado",
        "category": "authentication-security",
        "severity": "critical",
        "target_nf": "udm",
        "interfaces": ["N12", "N13"],
        "procedures": ["Authentication", "5G-AKA", "Registration"],
        "description": "Desprovisiona temporalmente el IMSI 999700000000001 en MongoDB del Core. El AMF y UDM rechazan el registro del UE por credenciales desconocidas.",
        "expected_detection": "< 5 segundos (alarma crítica de autenticación y rechazo 5GMM)",
        "recovery_action": "Restaura el suscriptor en MongoDB del Core 5G.",
    },
    {
        "id": "5g-f02",
        "scenario_id": "5g-sa",
        "title": "5G-F02: Incompatibilidad de Slicing (S-NSSAI)",
        "category": "configuration-telco",
        "severity": "warning",
        "target_nf": "ue",
        "interfaces": ["N1"],
        "procedures": ["PDU Session Establishment"],
        "description": "Divergencia entre el Slice Differentiator (SD) configurado en el UE frente al admitido por AMF/SMF.",
        "expected_detection": "Inmediato (auditoría automática en Configuration Center)",
        "recovery_action": "Alinear parámetros de S-NSSAI (SST/SD) en los archivos YAML.",
    },
]


class ExperimentsService:
    def __init__(self) -> None:
        self.active_state: dict[str, dict[str, Any]] = {}

    def catalog(self, scenario_id: str = "5g-sa") -> list[dict]:
        results = []
        for exp in EXPERIMENT_CATALOG:
            if exp["scenario_id"] == scenario_id:
                state_info = self.active_state.get(exp["id"], {"status": "nominal"})
                results.append({**exp, "state": state_info})
        return results

    async def inject(self, experiment_id: str, scenario_id: str = "5g-sa") -> dict:
        exp = next((e for e in EXPERIMENT_CATALOG if e["id"] == experiment_id and e["scenario_id"] == scenario_id), None)
        if not exp:
            raise KeyError(f"Experimento desconocido: {experiment_id}")

        start_time = time.monotonic()
        injected_at = datetime.now(timezone.utc).isoformat()

        if experiment_id == "5g-f03":
            await scenario_manager.stop_component(scenario_id, "amf")
            elapsed = round(time.monotonic() - start_time, 2)
            self.active_state[experiment_id] = {
                "status": "injected",
                "injected_at": injected_at,
                "elapsed_seconds": elapsed,
                "message": "Servicio open5gs-amfd detenido con éxito. Alarma N2 generada.",
            }
        elif experiment_id == "ops-f01":
            await scenario_manager.adapter.set_ip_forward(False)
            elapsed = round(time.monotonic() - start_time, 2)
            self.active_state[experiment_id] = {
                "status": "injected",
                "injected_at": injected_at,
                "elapsed_seconds": elapsed,
                "message": "Reenvío IPv4 desactivado en Linux. Tráfico N6 aislado.",
            }
        elif experiment_id == "5g-f01":
            from app.services.execution import RemoteExecutionAdapter
            adapter = scenario_manager.adapter
            if isinstance(adapter, RemoteExecutionAdapter):
                cmd = 'mongosh open5gs --quiet --eval "db.subscribers.updateOne({imsi: \'999700000000001\'}, {\\$set: {imsi: \'999700000000001_disabled\'}})"'
                await adapter._run(cmd)
            elapsed = round(time.monotonic() - start_time, 2)
            self.active_state[experiment_id] = {
                "status": "injected",
                "injected_at": injected_at,
                "elapsed_seconds": elapsed,
                "message": "SUPI 999700000000001 desprovisionado en MongoDB. Falla de autenticación 5G-AKA activa.",
            }
        elif experiment_id == "5g-f02":
            elapsed = round(time.monotonic() - start_time, 2)
            self.active_state[experiment_id] = {
                "status": "injected",
                "injected_at": injected_at,
                "elapsed_seconds": elapsed,
                "message": "Falla de slicing simulada. Visible en Configuration Center.",
            }
        else:
            raise ValueError(f"Acción de inyección no implementada para: {experiment_id}")

        return {
            "experiment_id": experiment_id,
            "status": "injected",
            "injected_at": injected_at,
            "detection_expected_under_seconds": 5,
            "state": self.active_state[experiment_id],
        }

    async def recover(self, experiment_id: str, scenario_id: str = "5g-sa") -> dict:
        exp = next((e for e in EXPERIMENT_CATALOG if e["id"] == experiment_id and e["scenario_id"] == scenario_id), None)
        if not exp:
            raise KeyError(f"Experimento desconocido: {experiment_id}")

        start_time = time.monotonic()
        recovered_at = datetime.now(timezone.utc).isoformat()

        if experiment_id == "5g-f03":
            # Reiniciar solo AMF deja a UERANSIM vivo pero sin una asociación
            # NGAP vigente. Reconstruimos la cadena RAN -> Core -> UE en orden.
            await scenario_manager.stop_component(scenario_id, "ue")
            await scenario_manager.stop_component(scenario_id, "gnb")
            await scenario_manager.start_component(scenario_id, "amf")
            await asyncio.sleep(0.5)
            await scenario_manager.start_component(scenario_id, "gnb")
            await asyncio.sleep(1)
            await scenario_manager.start_component(scenario_id, "ue")
            elapsed = round(time.monotonic() - start_time, 2)
            self.active_state[experiment_id] = {
                "status": "nominal",
                "recovered_at": recovered_at,
                "elapsed_seconds": elapsed,
                "message": "AMF, gNodeB y UE reactivados en orden. Asociación N2 y registro reconstruidos.",
            }
        elif experiment_id == "ops-f01":
            await scenario_manager.adapter.set_ip_forward(True)
            elapsed = round(time.monotonic() - start_time, 2)
            self.active_state[experiment_id] = {
                "status": "nominal",
                "recovered_at": recovered_at,
                "elapsed_seconds": elapsed,
                "message": "net.ipv4.ip_forward=1 restablecido. Tráfico N6 normalizado.",
            }
        elif experiment_id == "5g-f01":
            from app.services.execution import RemoteExecutionAdapter
            adapter = scenario_manager.adapter
            if isinstance(adapter, RemoteExecutionAdapter):
                cmd = 'mongosh open5gs --quiet --eval "db.subscribers.updateOne({imsi: \'999700000000001_disabled\'}, {\\$set: {imsi: \'999700000000001\'}})"'
                await adapter._run(cmd)
            elapsed = round(time.monotonic() - start_time, 2)
            self.active_state[experiment_id] = {
                "status": "nominal",
                "recovered_at": recovered_at,
                "elapsed_seconds": elapsed,
                "message": "SUPI 999700000000001 reactivado en MongoDB.",
            }
        elif experiment_id == "5g-f02":
            elapsed = round(time.monotonic() - start_time, 2)
            self.active_state[experiment_id] = {
                "status": "nominal",
                "recovered_at": recovered_at,
                "elapsed_seconds": elapsed,
                "message": "Slicing alineado con parámetros nominales.",
            }
        else:
            raise ValueError(f"Acción de recuperación no implementada para: {experiment_id}")

        return {
            "experiment_id": experiment_id,
            "status": "nominal",
            "recovered_at": recovered_at,
            "state": self.active_state[experiment_id],
        }


experiments_service = ExperimentsService()

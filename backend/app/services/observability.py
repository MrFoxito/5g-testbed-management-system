import asyncio
import os
import shutil
import struct
import time
import uuid
from datetime import datetime, timezone

import psutil

from app.core.config import get_settings
from app.models import Severity, TraceStart
from app.services.scenarios import CATALOG, scenario_manager


DISPLAY_FILTERS = {
    "s1ap": "s1ap",
    "ngap": "ngap",
    "nas": "nas-eps || nas-5gs",
    "gtpu": "gtp",
    "pfcp": "pfcp",
    "diameter": "diameter",
    "sbi": "http2",
}


class TraceService:
    def __init__(self) -> None:
        self.processes: dict[str, asyncio.subprocess.Process] = {}
        self.metadata: dict[str, dict] = {}

    def _write_empty_pcap(self, path) -> None:
        path.write_bytes(struct.pack("<IHHIIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1))

    async def start(self, request: TraceStart, username: str) -> dict:
        settings = get_settings()
        if request.interface not in settings.allowed_interfaces:
            raise ValueError("Interfaz no permitida")
        protocol = request.protocol.lower()
        if protocol not in DISPLAY_FILTERS:
            raise ValueError("Protocolo no permitido")
        trace_id = uuid.uuid4().hex
        path = settings.capture_dir / f"{trace_id}.pcap"
        meta = {
            "id": trace_id, "interface": request.interface, "protocol": protocol,
            "status": "running", "owner": username, "created_at": datetime.now(timezone.utc).isoformat(),
            "file": path.name,
        }
        if settings.enable_real_captures:
            if not shutil.which("tshark"):
                raise RuntimeError("tshark no está instalado")
            process = await asyncio.create_subprocess_exec(
                "tshark", "-i", request.interface, "-a", f"duration:{request.duration_seconds}",
                "-a", f"filesize:{request.max_megabytes * 1024}", "-f", self._capture_filter(protocol), "-w", str(path),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
            )
            self.processes[trace_id] = process
        else:
            self._write_empty_pcap(path)
            meta["status"] = "completed"
        self.metadata[trace_id] = meta
        return meta

    def _capture_filter(self, protocol: str) -> str:
        return {
            "s1ap": "sctp", "ngap": "sctp", "nas": "sctp", "gtpu": "udp port 2152",
            "pfcp": "udp port 8805", "diameter": "tcp port 3868 or sctp port 3868", "sbi": "tcp",
        }[protocol]

    async def stop(self, trace_id: str) -> dict:
        if trace_id not in self.metadata:
            raise KeyError(trace_id)
        process = self.processes.pop(trace_id, None)
        if process and process.returncode is None:
            process.terminate()
            await process.wait()
        self.metadata[trace_id]["status"] = "completed"
        return self.metadata[trace_id]

    def list(self) -> list[dict]:
        for trace_id, process in list(self.processes.items()):
            if process.returncode is not None:
                self.metadata[trace_id]["status"] = "completed" if process.returncode == 0 else "failed"
                self.processes.pop(trace_id, None)
        return list(self.metadata.values())


class MetricsService:
    def __init__(self) -> None:
        self.previous: dict[str, tuple[float, int, int]] = {}

    def snapshot(self) -> dict:
        now = time.monotonic()
        interfaces = {}
        for name, counters in psutil.net_io_counters(pernic=True).items():
            if name not in get_settings().allowed_interfaces:
                continue
            old = self.previous.get(name)
            elapsed = now - old[0] if old else 0
            interfaces[name] = {
                "rx_bytes": counters.bytes_recv,
                "tx_bytes": counters.bytes_sent,
                "rx_mbps": round((counters.bytes_recv - old[1]) * 8 / elapsed / 1_000_000, 3) if elapsed else 0,
                "tx_mbps": round((counters.bytes_sent - old[2]) * 8 / elapsed / 1_000_000, 3) if elapsed else 0,
            }
            self.previous[name] = (now, counters.bytes_recv, counters.bytes_sent)
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "cpu_percent": psutil.cpu_percent(interval=None),
            "memory_percent": psutil.virtual_memory().percent,
            "interfaces": interfaces,
            "rrc": {"available": False, "reason": "Requiere habilitar métricas JSON de srsRAN"},
        }


async def collect_alarms(scenario_id: str) -> list[dict]:
    status = await scenario_manager.status(scenario_id)
    alarms = []
    for component in status.components:
        if component.status == "running":
            continue
        severity = Severity.critical if component.kind in {"database", "core"} else Severity.major
        alarms.append({
            "id": f"{scenario_id}:{component.id}:service-down",
            "scenario_id": scenario_id,
            "component": component.id,
            "severity": severity,
            "state": "active",
            "probable_cause": "serviceUnavailable",
            "message": f"{component.label} no está activo",
            "observed_at": datetime.now(timezone.utc).isoformat(),
        })
    return alarms


trace_service = TraceService()
metrics_service = MetricsService()

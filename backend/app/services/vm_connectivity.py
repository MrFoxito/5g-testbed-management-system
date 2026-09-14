"""Read-only authenticated SSH probes, independent of NF simulation/control."""
import asyncio
import json
import socket
from datetime import datetime, timezone
from time import monotonic

import paramiko

from app.core.config import get_settings


def probe_vm(node: dict) -> dict:
    settings = get_settings()
    result = {**node, "status": "unreachable", "detail": "No se pudo conectar por SSH", "latency_ms": None}
    if not settings.vm_ssh_key_path.is_file() or not settings.vm_known_hosts_path.is_file():
        return {**result, "status": "unconfigured", "detail": "Falta configurar la clave SSH o registrar la identidad de la VM"}
    started = monotonic()
    try:
        # Close the SSH client before its socket, including error paths.
        with socket.create_connection((settings.vm_ssh_host, node["ssh_port"]), timeout=5) as transport:
            with paramiko.SSHClient() as client:
                client.load_host_keys(str(settings.vm_known_hosts_path))
                client.set_missing_host_key_policy(paramiko.RejectPolicy())
                # Docker reaches the same localhost NAT identity through its host gateway.
                client.connect("127.0.0.1", port=node["ssh_port"], username=settings.vm_ssh_user,
                               key_filename=str(settings.vm_ssh_key_path), look_for_keys=False, allow_agent=False,
                               sock=transport, timeout=5, banner_timeout=5, auth_timeout=5)
                return _verify_guest(client, node, result, started)

    except paramiko.AuthenticationException:
        result.update(status="auth_failed", detail="La VM respondió, pero rechazó la autenticación SSH")
    except paramiko.BadHostKeyException:
        result.update(status="identity_failed", detail="La identidad SSH cambió; revisar known_hosts")
    except (socket.timeout, OSError, EOFError):
        pass
    except paramiko.SSHException:
        result.update(status="ssh_failed", detail="No se pudo verificar la sesión SSH")
    return result


def _verify_guest(client, node, result, started):
    _, stdout, _ = client.exec_command("hostname; ip -4 -o addr show enp0s8; test -f /etc/maestro-vm-ready", timeout=5)
    output = stdout.read(8192).decode("utf-8", errors="replace")
    lines = output.splitlines()
    addresses = [words[words.index("inet") + 1] for line in lines[1:]
                 if "inet" in (words := line.split())]
    valid_address = addresses == [f"{node['address']}/24"]
    if stdout.channel.recv_exit_status() != 0 or not lines or lines[0] != node["id"] or not valid_address:
        return {**result, "status": "mismatch", "detail": "SSH disponible; identidad o IP interna no coincide con el inventario"}
    result.update(status="connected", detail="SSH autenticado e IP interna verificada", latency_ms=round((monotonic() - started) * 1000))
    return result


async def connectivity(scenario_id: str) -> dict:
    settings = get_settings()
    deployed = scenario_id in settings.deployed_scenarios
    inventory = json.loads(settings.vm_inventory_path.read_text(encoding="utf-8"))
    nodes = inventory.get(scenario_id, []) if deployed else []
    results = await asyncio.gather(*(asyncio.to_thread(probe_vm, node) for node in nodes))
    return {"scenario_id": scenario_id, "deployed": deployed, "nodes": results,
            "connected": sum(node["status"] == "connected" for node in results),
            "total": len(results), "checked_at": datetime.now(timezone.utc).isoformat(),
            "stage": "connectivity", "services_installed": False}

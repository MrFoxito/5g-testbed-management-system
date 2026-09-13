import asyncio
import json
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.services.execution import RemoteExecutionAdapter
from app.core.config import get_settings

async def test():
    settings = get_settings()
    print("Settings:")
    print(f"  ssh_port: {settings.ssh_port}")
    print(f"  upf_ssh_port: {settings.upf_ssh_port}")
    print(f"  upf2_ssh_port: {settings.upf2_ssh_port}")
    print(f"  gnb_ssh_port: {settings.gnb_ssh_port}")
    print(f"  ue_ssh_port: {settings.ue_ssh_port}")

    adapter = RemoteExecutionAdapter({'open5gs-upfd', 'open5gs-upfd2', 'ueransim-gnb', 'ueransim-ue', 'open5gs-amfd'})
    print("\n1. Testing service_statuses...")
    statuses = await adapter.service_statuses(['open5gs-upfd', 'open5gs-upfd2', 'ueransim-gnb', 'ueransim-ue', 'open5gs-amfd'])
    print("Statuses:", statuses)

    print("\n2. Testing runtime_snapshot...")
    snap = await adapter.runtime_snapshot()
    print("Hosts count:", len(snap.get("hosts", [])))
    for h in snap.get("hosts", []):
        print(f"  Host {h['id']}: {h['hostname']} ({h['ip']}) - {h['role']}")

    print("\n3. Testing remote_kpis...")
    kpis = await adapter.remote_kpis()
    print("KPIs load:", kpis.get("load_1m"), "mem:", kpis.get("memory_percent"), "ifaces:", list(kpis.get("interfaces", {}).keys()))

    print("\n4. Testing generate_test_traffic...")
    traffic = await adapter.generate_test_traffic(3)
    print("Traffic success:", traffic.get("success"))
    print("Traffic output:\n" + traffic.get("output", "").strip())

    print("\n5. Testing native_operation ueransim-nodes...")
    nodes = await adapter.native_operation("ueransim-nodes", "ueransim-gnb", {})
    print("Nodes:", nodes)

if __name__ == "__main__":
    asyncio.run(test())

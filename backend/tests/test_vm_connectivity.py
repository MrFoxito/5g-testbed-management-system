import asyncio
from unittest.mock import MagicMock

from app.core.config import get_settings
from app.services import vm_connectivity as service


def test_undeployed_5g_never_probes(monkeypatch):
    monkeypatch.setattr(get_settings(), "deployed_scenarios", ["4g-epc"])
    probe = MagicMock(side_effect=AssertionError("5G must not be contacted"))
    monkeypatch.setattr(service, "probe_vm", probe)
    result = asyncio.run(service.connectivity("5g-sa"))
    assert result["nodes"] == []
    assert result["deployed"] is False
    probe.assert_not_called()


def test_connectivity_counts_only_verified_guests(monkeypatch):
    monkeypatch.setattr(get_settings(), "deployed_scenarios", ["4g-epc"])
    def probe(node):
        return {**node, "status": "connected" if node["id"] == "epc-cp" else "unreachable"}
    monkeypatch.setattr(service, "probe_vm", probe)
    result = asyncio.run(service.connectivity("4g-epc"))
    assert (result["connected"], result["total"]) == (1, 5)
    assert result["services_installed"] is False


def test_guest_identity_and_address_must_both_match():
    node = {"id": "epc-cp", "address": "10.210.40.1"}
    client = MagicMock()
    stdout = MagicMock()
    stdout.channel.recv_exit_status.return_value = 0
    client.exec_command.return_value = (None, stdout, None)
    stdout.read.return_value = b"epc-cp\n3: enp0s8 inet 10.210.40.1/24 brd 10.210.40.255\n"
    assert service._verify_guest(client, node, {}, 0)["status"] == "connected"
    for invalid in [b"wrong-vm\n3: enp0s8 inet 10.210.40.1/24\n", b"epc-cp\n3: enp0s8 inet 110.210.40.1/24\n", b"epc-cp\n3: enp0s8 inet 10.210.40.1/24\n3: enp0s8 inet 10.210.40.2/24\n"]:
        stdout.read.return_value = invalid
        assert service._verify_guest(client, node, {}, 0)["status"] == "mismatch"


def test_infrastructure_profile_blocks_nf_operations(client, teacher_headers, monkeypatch):
    monkeypatch.setattr(get_settings(), "deployment_stage", "connectivity")
    response = client.get("/api/v1/deployment", headers=teacher_headers)
    assert response.json()["stage"] == "connectivity"
    assert client.get("/api/v1/scenarios/5g-sa/status", headers=teacher_headers).status_code == 409
    assert client.post("/api/v1/scenarios/4g-epc/stop", headers=teacher_headers).status_code == 409
    assert client.get("/api/v1/deployment/4g-epc/connectivity").status_code == 401
    result = client.get("/api/v1/deployment/5g-sa/connectivity", headers=teacher_headers)
    assert result.status_code == 200
    assert result.json()["nodes"] == []


def test_full_profile_still_serves_existing_5g(client, teacher_headers, monkeypatch):
    monkeypatch.setattr(get_settings(), "deployment_stage", "full")
    response = client.get("/api/v1/scenarios/5g-sa/status", headers=teacher_headers)
    assert response.status_code == 200
    assert response.json()["components"]

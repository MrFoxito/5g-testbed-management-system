def parameters(five_g=False):
    value = {"mcc": "716", "mnc": "10", "tac": 1, "apn_dnn": "internet"}
    if five_g:
        value.update({"sst": 1, "sd": "000001"})
    return value


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["execution_mode"] == "simulated"


def test_student_can_read_but_cannot_operate(client, student_headers):
    assert client.get("/api/v1/scenarios", headers=student_headers).status_code == 200
    response = client.post(
        "/api/v1/scenarios/4g-epc/start",
        headers=student_headers,
        json={"parameters": parameters(), "testbed": "local"},
    )
    assert response.status_code == 403


def test_scenario_cycle_and_audit(client, teacher_headers):
    start = client.post(
        "/api/v1/scenarios/5g-sa/start",
        headers=teacher_headers,
        json={"parameters": parameters(True), "testbed": "local"},
    )
    assert start.status_code == 200
    assert start.json()["state"] == "running"
    assert all(item["status"] == "running" for item in start.json()["components"])
    stop = client.post("/api/v1/scenarios/5g-sa/stop", headers=teacher_headers)
    assert stop.status_code == 200
    assert stop.json()["state"] == "stopped"
    audit = client.get("/api/v1/audit", headers=teacher_headers).json()
    assert any(item["action"] == "scenario.start" for item in audit)


def test_config_backup_and_restore(client, teacher_headers):
    first = "amf:\n  name: first\n"
    second = "amf:\n  name: second\n"
    assert client.put("/api/v1/config", headers=teacher_headers, json={"path": "amf.yaml", "content": first}).status_code == 200
    result = client.put("/api/v1/config", headers=teacher_headers, json={"path": "amf.yaml", "content": second})
    assert result.status_code == 200
    assert result.json()["backup"]
    restored = client.post("/api/v1/config/restore?path=amf.yaml", headers=teacher_headers)
    assert restored.status_code == 200
    current = client.get("/api/v1/config?path=amf.yaml", headers=teacher_headers)
    assert "first" in current.json()["content"]


def test_subscriber_secrets_are_masked_and_not_audited(client, teacher_headers):
    payload = {
        "imsi": "716100000000001", "key": "00112233445566778899AABBCCDDEEFF",
        "opc": "FFEEDDCCBBAA99887766554433221100", "amf": "8000",
        "apn_dnn": "internet", "sst": 1, "sd": "000001",
    }
    response = client.post("/api/v1/subscribers", headers=teacher_headers, json=payload)
    assert response.status_code in (201, 409)
    listing = client.get("/api/v1/subscribers", headers=teacher_headers).json()
    serialized = str(listing)
    assert payload["key"] not in serialized
    assert payload["opc"] not in serialized
    audit = client.get("/api/v1/audit", headers=teacher_headers).text
    assert payload["key"] not in audit


def test_simulated_pcap(client, teacher_headers):
    response = client.post("/api/v1/traces", headers=teacher_headers, json={
        "interface": "lo", "protocol": "ngap", "duration_seconds": 5, "max_megabytes": 1,
    })
    assert response.status_code == 201
    trace_id = response.json()["id"]
    download = client.get(f"/api/v1/traces/{trace_id}/download", headers=teacher_headers)
    assert download.status_code == 200
    assert download.content[:4] == bytes.fromhex("d4c3b2a1")

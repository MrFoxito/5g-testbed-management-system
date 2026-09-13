import urllib.request
import json

def test_api():
    login_data = json.dumps({"username": "admin", "password": "admin-change-me"}).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/v1/auth/login",
        data=login_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        token = res["access_token"]
        print("Login OK, Token obtained.")

    req2 = urllib.request.Request(
        "http://127.0.0.1:8000/api/v1/scenarios/5g-sa/status",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req2) as resp2:
        status_data = json.loads(resp2.read().decode())
        print(f"\n[Scenario Status] State: {status_data['state']}")
        for c in status_data["components"]:
            print(f"  NF {c['id']:<10} ({c['label']:<12}) node: {c['node_id']:<10} unit: {c['unit']:<18} status: {c['status']}")

    req3 = urllib.request.Request(
        "http://127.0.0.1:8000/api/v1/alarms/5g-sa",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req3) as resp3:
        alarms_data = json.loads(resp3.read().decode())
        print(f"\n[Active Alarms] Count: {len(alarms_data)}")
        for a in alarms_data:
            print(f"  Alarm: {a['id']} - {a['message']}")

    req4 = urllib.request.Request(
        "http://127.0.0.1:8000/api/v1/runtime/5g-sa",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req4) as resp4:
        rt_data = json.loads(resp4.read().decode())
        print(f"\n[Runtime Snapshot] Hostname: {rt_data.get('hostname')}")
        ifaces = [i['name'] for i in rt_data.get('interfaces', [])]
        print(f"  Interfaces: {ifaces}")
        ports = [(p['protocol'], p['address'], p['port']) for p in rt_data.get('listening_ports', []) if p['port'] in [8805, 2152, 38412, 7777]]
        print(f"  Key Telco Ports: {ports}")

    req5 = urllib.request.Request(
        "http://127.0.0.1:8000/api/v1/metrics?scenario_id=5g-sa",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req5) as resp5:
        m_data = json.loads(resp5.read().decode())
        print(f"\n[Metrics Snapshot]")
        print(f"  Telco: {m_data.get('telco')}")
        print(f"  Interfaces reported: {list(m_data.get('interfaces', {}).keys())}")

if __name__ == "__main__":
    test_api()

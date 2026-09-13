import urllib.request
import json
import subprocess
import paramiko

def check_all():
    print("=================================================================")
    print("      5G STANDALONE DISTRIBUTED TESTBED HEALTH REPORT            ")
    print("=================================================================")

    # 1. VirtualBox VMs
    vbox = "C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe"
    res = subprocess.run([vbox, "list", "runningvms"], capture_output=True, text=True)
    print("\n[1] Running VirtualBox VMs:")
    for line in res.stdout.strip().splitlines():
        print(f"  * {line}")

    # 2. Ports and Services
    nodes = [
        ("Core CP", 2222, "open5gs-amfd"),
        ("UPF-01 (Internet)", 2223, "open5gs-upfd"),
        ("UPF-02 (Corporate)", 2224, "open5gs-upfd"),
        ("gNodeB RAN", 2225, "ueransim-gnb"),
        ("UE Subsystem", 2226, "ueransim-ue"),
    ]
    print("\n[2] SSH Connectivity & Service Status:")
    for name, port, service in nodes:
        try:
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect("127.0.0.1", port=port, username="emsadmin", password="1506", timeout=5)
            _, out, _ = c.exec_command(f"systemctl is-active {service} && ip -br a show enp0s8")
            status = out.read().decode().strip().replace("\n", " | ")
            print(f"  * {name:<20} (Port {port}): {status}")
            c.close()
        except Exception as e:
            print(f"  * {name:<20} (Port {port}): ERROR - {e}")

    # 3. Dual-Slice PDU Session Ping from UE
    print("\n[3] Dual-Slice End-to-End Traffic Tests from UE-01:")
    try:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect("127.0.0.1", port=2226, username="emsadmin", password="1506", timeout=5)
        
        # Internet Slice Ping
        _, out1, _ = c.exec_command("ping -c 3 -I uesimtun0 8.8.8.8")
        res1 = out1.read().decode()
        loss1 = "0% packet loss" in res1
        print(f"  * Slice Internet (uesimtun0 -> 8.8.8.8)   : {'SUCCESS (0% loss)' if loss1 else 'FAILED'}")

        # Corporate Slice Ping
        _, out2, _ = c.exec_command("ping -c 3 -I uesimtun1 10.46.0.1")
        res2 = out2.read().decode()
        loss2 = "0% packet loss" in res2
        print(f"  * Slice Corporate (uesimtun1 -> 10.46.0.1): {'SUCCESS (0% loss)' if loss2 else 'FAILED'}")
        c.close()
    except Exception as e:
        print(f"  * Ping Test ERROR: {e}")

    # 4. MAEstro Backend API Status
    print("\n[4] MAEstro Education Platform API:")
    try:
        login_data = json.dumps({"username": "admin", "password": "admin-change-me"}).encode("utf-8")
        req = urllib.request.Request("http://127.0.0.1:8000/api/v1/auth/login", data=login_data, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req) as resp:
            token = json.loads(resp.read().decode())["access_token"]

        req_status = urllib.request.Request("http://127.0.0.1:8000/api/v1/scenarios/5g-sa/status", headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req_status) as resp:
            st = json.loads(resp.read().decode())
            print(f"  * Scenario State: {st['state']}")
            print(f"  * Active Network Functions: {len([c for c in st['components'] if c['status'] == 'running'])}/{len(st['components'])}")

        req_alarms = urllib.request.Request("http://127.0.0.1:8000/api/v1/alarms/5g-sa", headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req_alarms) as resp:
            al = json.loads(resp.read().decode())
            print(f"  * Active System Alarms: {len(al)}")

        req_rt = urllib.request.Request("http://127.0.0.1:8000/api/v1/runtime/5g-sa", headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req_rt) as resp:
            rt = json.loads(resp.read().decode())
            print(f"  * Monitored Physical Hosts: {len(rt.get('hosts', []))}")
            for h in rt.get('hosts', []):
                print(f"    - {h['id']:<10} | {h['hostname']:<16} | {h['ip']:<14} | {h['role']}")
    except Exception as e:
        print(f"  * MAEstro API ERROR: {e}")

    print("\n=================================================================")

if __name__ == "__main__":
    check_all()

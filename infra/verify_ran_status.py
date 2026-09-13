import time
import paramiko

def run(port, cmd, sudo=True):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("127.0.0.1", port=port, username="emsadmin", password="1506", timeout=10)
    full = f"printf '%s\\n' '1506' | sudo -S bash -c {cmd!r}" if sudo else cmd
    _, stdout, stderr = c.exec_command(full)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    c.close()
    return out

# 1. Clean secondary IP from GNB and UE
print("Cleaning secondary IPs...")
run(2225, "ip addr del 10.210.50.8/24 dev enp0s8 || true")
run(2226, "ip addr del 10.210.50.8/24 dev enp0s8 || true")

# 2. Restart services
print("Restarting ueransim-gnb and ueransim-ue...")
run(2225, "systemctl restart ueransim-gnb")
time.sleep(3)
run(2226, "systemctl restart ueransim-ue")
time.sleep(4)

print("\n=== GNB LOGS ===")
print(run(2225, "journalctl -u ueransim-gnb -n 25 --no-pager"))

print("\n=== UE LOGS ===")
print(run(2226, "journalctl -u ueransim-ue -n 35 --no-pager"))

print("\n=== UE INTERFACES ===")
print(run(2226, "ip -br a"))

print("\n=== END-TO-END PING FROM UE (Internet: 8.8.8.8) ===")
print(run(2226, "ping -c 3 -I uesimtun0 8.8.8.8 || true"))

print("\n=== END-TO-END PING FROM UE (Corporate: 10.46.0.1) ===")
print(run(2226, "ping -c 3 -I uesimtun1 10.46.0.1 || true"))

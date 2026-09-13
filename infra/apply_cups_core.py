import sys
import time
import paramiko

CORE_HOST = "127.0.0.1"
CORE_PORT = 2222
CORE_USER = "emsadmin"
CORE_PASS = "1506"

UPF_HOST = "127.0.0.1"
UPF_PORT = 2223
UPF_USER = "emsadmin"
UPF_PASS = "1506"

def run_ssh(host, port, user, password, cmd, sudo=False):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, port=port, username=user, password=password, timeout=10)
    try:
        if sudo:
            full_cmd = f"printf '%s\\n' '{password}' | sudo -S bash -c {cmd!r}"
        else:
            full_cmd = cmd
        stdin, stdout, stderr = client.exec_command(full_cmd, timeout=30)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        status = stdout.channel.recv_exit_status()
        return status, out, err
    finally:
        client.close()

def main():
    print("=== Step 1: Update SMF config on Core VM ===")
    status, smf_content, _ = run_ssh(CORE_HOST, CORE_PORT, CORE_USER, CORE_PASS, "cat /etc/open5gs/smf.yaml")
    if status != 0:
        print("Error reading /etc/open5gs/smf.yaml")
        sys.exit(1)

    old_block = """  pfcp:
    server:
      - address: 127.0.0.4
    client:
      upf:
        - address: 127.0.0.7"""

    new_block = """  pfcp:
    server:
      - address: 10.210.50.1
      - address: 127.0.0.4
    client:
      upf:
        - address: 10.210.50.8"""

    if old_block in smf_content:
        updated_smf = smf_content.replace(old_block, new_block, 1)
        # Upload via sftp
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(CORE_HOST, port=CORE_PORT, username=CORE_USER, password=CORE_PASS, timeout=10)
        sftp = client.open_sftp()
        with sftp.file("/tmp/smf.yaml", "w") as f:
            f.write(updated_smf)
        sftp.close()
        client.close()
        run_ssh(CORE_HOST, CORE_PORT, CORE_USER, CORE_PASS, "cp /tmp/smf.yaml /etc/open5gs/smf.yaml", sudo=True)
        print("smf.yaml updated successfully.")
    elif "address: 10.210.50.8" in smf_content:
        print("smf.yaml already points to 10.210.50.8.")
    else:
        print("Warning: old_block pattern not found exactly in smf.yaml. Checking contents...")
        print(smf_content[:500])

    print("=== Step 2: Update UERANSIM gNB config on Core VM ===")
    status, gnb_content, _ = run_ssh(CORE_HOST, CORE_PORT, CORE_USER, CORE_PASS, "cat /home/emsadmin/UERANSIM/config/open5gs-gnb.yaml")
    if "gtpIp: 127.0.0.1" in gnb_content:
        updated_gnb = gnb_content.replace("gtpIp: 127.0.0.1", "gtpIp: 10.210.50.1", 1)
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(CORE_HOST, port=CORE_PORT, username=CORE_USER, password=CORE_PASS, timeout=10)
        sftp = client.open_sftp()
        with sftp.file("/tmp/open5gs-gnb.yaml", "w") as f:
            f.write(updated_gnb)
        sftp.close()
        client.close()
        run_ssh(CORE_HOST, CORE_PORT, CORE_USER, CORE_PASS, "cp /tmp/open5gs-gnb.yaml /home/emsadmin/UERANSIM/config/open5gs-gnb.yaml", sudo=True)
        print("open5gs-gnb.yaml updated successfully.")
    elif "gtpIp: 10.210.50.1" in gnb_content:
        print("open5gs-gnb.yaml already has gtpIp: 10.210.50.1.")

    print("=== Step 3: Stop local UPF on Core VM to enforce CUPS on VM 2 ===")
    run_ssh(CORE_HOST, CORE_PORT, CORE_USER, CORE_PASS, "systemctl stop open5gs-upfd", sudo=True)

    print("=== Step 4: Restart SMF, gNB and UE on Core VM ===")
    restart_cmd = "systemctl restart open5gs-smfd && sleep 2 && systemctl restart ueransim-gnb && sleep 2 && systemctl restart ueransim-ue && sleep 3"
    status, out, err = run_ssh(CORE_HOST, CORE_PORT, CORE_USER, CORE_PASS, restart_cmd, sudo=True)
    print("Restart result status:", status)

    print("=== Step 5: Check SMF logs on Core VM ===")
    _, smf_logs, _ = run_ssh(CORE_HOST, CORE_PORT, CORE_USER, CORE_PASS, "journalctl -u open5gs-smfd -n 25 --no-pager")
    print(smf_logs)

    print("=== Step 6: Check UPF logs on UPF VM ===")
    _, upf_logs, _ = run_ssh(UPF_HOST, UPF_PORT, UPF_USER, UPF_PASS, "journalctl -u open5gs-upfd -n 25 --no-pager")
    print(upf_logs)

if __name__ == "__main__":
    main()

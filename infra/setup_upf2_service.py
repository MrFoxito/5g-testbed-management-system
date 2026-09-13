import sys
import time
import paramiko

# UPF-02 Network & Service Configuration for Corporate / Enterprise Slice
UPF_NETDEV = """[NetDev]
Name=ogstun
Kind=tun
"""

UPF_NETWORK = """[Match]
Name=ogstun

[Network]
Address=10.46.0.1/16

[Route]
Gateway=0.0.0.0
Destination=10.46.0.0/16

[Link]
MTUBytes=1400
RequiredForOnline=false
"""

UPF_YAML = """logger:
  file:
    path: /var/log/open5gs/upf.log
  level: info

global:
  max:
    ue: 1024

upf:
  pfcp:
    server:
      - address: 10.210.50.9
  gtpu:
    server:
      - address: 10.210.50.9
  session:
    - subnet: 10.46.0.0/16
      gateway: 10.46.0.1
      dev: ogstun
  metrics:
    server:
      - address: 127.0.0.1
        port: 9090
"""

def setup_upf2():
    print("Connecting to EMS-UPF-02 on port 2224...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("127.0.0.1", port=2224, username="emsadmin", password="1506", timeout=20)

    # 1. Update netplan for enp0s8 to 10.210.50.9/24
    netplan_cfg = """network:
  version: 2
  renderer: networkd
  ethernets:
    enp0s8:
      addresses:
        - 10.210.50.9/24
"""
    sftp = client.open_sftp()
    with sftp.file("/tmp/01-netcfg.yaml", "w") as f:
        f.write(netplan_cfg)
    with sftp.file("/tmp/99-open5gs.netdev", "w") as f:
        f.write(UPF_NETDEV)
    with sftp.file("/tmp/99-open5gs.network", "w") as f:
        f.write(UPF_NETWORK)
    with sftp.file("/tmp/upf.yaml", "w") as f:
        f.write(UPF_YAML)
    sftp.close()

    commands = [
        "hostnamectl set-hostname upf-02.ems.test",
        "mv /tmp/01-netcfg.yaml /etc/netplan/01-netcfg.yaml",
        "netplan apply",
        "mv /tmp/99-open5gs.netdev /etc/systemd/network/99-open5gs.netdev",
        "mv /tmp/99-open5gs.network /etc/systemd/network/99-open5gs.network",
        "systemctl restart systemd-networkd",
        "sysctl -w net.ipv4.ip_forward=1",
        "echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-open5gs.conf",
        "iptables -t nat -F POSTROUTING",
        "iptables -t nat -A POSTROUTING -s 10.46.0.0/16 ! -o ogstun -j MASQUERADE",
        "mv /tmp/upf.yaml /etc/open5gs/upf.yaml",
        "systemctl restart open5gs-upfd",
        "sleep 2",
        "ip -brief address show",
        "systemctl is-active open5gs-upfd",
        "ss -lnup"
    ]

    combined = " && ".join(commands)
    sudo_cmd = f"printf '%s\\n' '1506' | sudo -S bash -c {combined!r}"
    stdin, stdout, stderr = client.exec_command(sudo_cmd)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print("OUTPUT:\n", out)
    if err:
        print("STDERR:\n", err)
    client.close()

if __name__ == "__main__":
    setup_upf2()

import sys
import paramiko

UPF_NETDEV = """[NetDev]
Name=ogstun
Kind=tun
"""

UPF_NETWORK = """[Match]
Name=ogstun

[Network]
Address=10.45.0.1/16
Address=2001:db8:cafe::1/48

[Route]
Gateway=0.0.0.0
Destination=10.45.0.0/16

[Route]
Gateway=::
Destination=2001:db8:cafe::0/48

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
      - address: 10.210.50.8
  gtpu:
    server:
      - address: 10.210.50.8
  session:
    - subnet: 10.45.0.0/16
      gateway: 10.45.0.1
      dev: ogstun
    - subnet: 2001:db8:cafe::/48
      gateway: 2001:db8:cafe::1
      dev: ogstun
  metrics:
    server:
      - address: 127.0.0.1
        port: 9090
"""

def setup_upf():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("127.0.0.1", port=2223, username="emsadmin", password="1506", timeout=10)

    sftp = client.open_sftp()
    with sftp.file("/tmp/99-open5gs.netdev", "w") as f:
        f.write(UPF_NETDEV)
    with sftp.file("/tmp/99-open5gs.network", "w") as f:
        f.write(UPF_NETWORK)
    with sftp.file("/tmp/upf.yaml", "w") as f:
        f.write(UPF_YAML)
    sftp.close()

    commands = [
        "mv /tmp/99-open5gs.netdev /etc/systemd/network/99-open5gs.netdev",
        "mv /tmp/99-open5gs.network /etc/systemd/network/99-open5gs.network",
        "systemctl enable --now systemd-networkd",
        "systemctl restart systemd-networkd",
        "sysctl -w net.ipv4.ip_forward=1",
        "echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-open5gs.conf",
        "iptables -t nat -C POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE",
        "cp /etc/open5gs/upf.yaml /etc/open5gs/upf.yaml.orig",
        "mv /tmp/upf.yaml /etc/open5gs/upf.yaml",
        "systemctl restart open5gs-upfd",
        "sleep 2",
        "ip -brief address show ogstun",
        "systemctl is-active open5gs-upfd",
        "ss -lnup"
    ]

    combined = " && ".join(commands)
    sudo_cmd = f"printf '%s\\n' '1506' | sudo -S bash -c {combined!r}"
    stdin, stdout, stderr = client.exec_command(sudo_cmd)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print("OUTPUT:")
    print(out)
    if err:
        print("STDERR:")
        print(err)
    client.close()

if __name__ == "__main__":
    setup_upf()

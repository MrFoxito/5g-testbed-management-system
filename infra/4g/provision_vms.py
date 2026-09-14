"""Install the five isolated Ubuntu/SSH VMs; no EPC or RAN packages yet.

Run with backend/.venv/Scripts/python.exe infra/4g/provision_vms.py.
All generated media, keys and credentials live OUTSIDE the repository.
Existing machines are never recreated. Installation is sequential to limit RAM.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import secrets
import subprocess
import time
from pathlib import Path

import paramiko

logging.getLogger("paramiko.transport").addHandler(logging.NullHandler())
logging.getLogger("paramiko.transport").propagate = False

ROOT = Path(__file__).resolve().parents[2]
VBOX = Path("C:/Program Files/Oracle/VirtualBox/VBoxManage.exe")
ISO = Path.home() / "Downloads/ubuntu-22.04.5-live-server-amd64.iso"
BASE = Path.home() / "VirtualBox VMs/MAEstro-4G"
ISO_SHA256 = "9bc6028870aef3f74f4e16b900008179e78b130e6b0b9a140635434a46aa98b0"
NODES = [
    ("epc-cp", "EMS-EPC-CP", "10.210.40.1", 2230, 2048, 30720),
    ("sgwu-vm", "EMS-SGW-U", "10.210.40.2", 2231, 1536, 20480),
    ("pgwu-vm", "EMS-PGW-U", "10.210.40.3", 2232, 1536, 20480),
    ("enb-vm", "EMS-ENB", "10.210.40.10", 2233, 1536, 20480),
    ("ue-vm", "EMS-UE-4G", "10.210.40.11", 2234, 1536, 20480),
]


def run(*args, password=None):
    result = subprocess.run([str(VBOX), *map(str, args)],
                            input=password + "\n" if password else None,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        detail = result.stdout + result.stderr
        if password:
            detail = detail.replace(password, "[REDACTED]")
        raise RuntimeError(detail)
    return result.stdout


def credentials():
    BASE.mkdir(parents=True, exist_ok=True)
    path = BASE / "credentials.json"
    if not path.exists():
        key = paramiko.RSAKey.generate(3072)
        key.write_private_key_file(str(BASE / "id_rsa"))
        (BASE / "id_rsa.pub").write_text(f"{key.get_name()} {key.get_base64()} maestro-4g\n")
        path.write_text(json.dumps({"username": "emsadmin", "password": secrets.token_urlsafe(24)}, indent=2))
    return json.loads(path.read_text())


def connect(port):
    client = paramiko.SSHClient()
    known = BASE / "known_hosts"
    if known.exists():
        # Do not persist the installer's temporary key (its SSH server starts
        # before the installed guest exists).
        keys = paramiko.HostKeys(str(known))
        node_id = next(node[0] for node in NODES if node[3] == port)
        for host, entries in keys.items():
            if port == 2230 and host == f"[127.0.0.1]:{port}" and not (BASE / f"{node_id}.verified").exists():
                continue
            for kind, key in entries.items():
                client.get_host_keys().add(host, kind, key)
    # First contact is confined to the local NAT ports we provisioned.
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("127.0.0.1", port=port, username="emsadmin", pkey=paramiko.RSAKey.from_private_key_file(str(BASE / "id_rsa")),
                   timeout=5, banner_timeout=5, auth_timeout=5, look_for_keys=False, allow_agent=False)
    return client


def verify(node):
    node_id, name, ip, port, _, _ = node
    with connect(port) as client:
        _, stdout, stderr = client.exec_command("hostname; ip -4 -o addr show enp0s8; test -f /etc/maestro-vm-ready", timeout=10)
        output = stdout.read().decode()
        if stdout.channel.recv_exit_status() != 0 or f"{ip}/24" not in output or node_id not in output.splitlines():
            raise RuntimeError(f"{name}: guest identity/network not ready")
        client.save_host_keys(str(BASE / "known_hosts"))
        (BASE / f"{node_id}.verified").touch()
    return {"node_id": node_id, "vm_name": name, "ip": ip, "ssh_port": port, "authenticated": True}


def create(node, auth):
    node_id, name, ip, port, memory, disk_size = node
    folder = BASE / name
    if f'"{name}"' in run("list", "vms") or folder.exists():
        print(f"{name}: already exists; resuming verification only", flush=True)
        return
    public_key = (BASE / "id_rsa.pub").read_text().strip()
    template = BASE / f"{node_id}-autoinstall.yaml"
    template.write_text(f"""#cloud-config
autoinstall:
  version: 1
  refresh-installer:
    update: false
  locale: en_US.UTF-8
  keyboard:
    layout: us
  identity:
    hostname: {node_id}
    username: '@@VBOX_INSERT_USER_LOGIN@@'
    password: '@@VBOX_INSERT_USER_PASSWORD_SHACRYPT512@@'
  ssh:
    install-server: true
    allow-pw: false
    authorized-keys:
      - '{public_key}'
  network:
    version: 2
    ethernets:
      enp0s3:
        dhcp4: true
      enp0s8:
        dhcp4: false
        addresses: [{ip}/24]
        optional: true
  storage:
    layout:
      name: direct
    swap:
      size: 1073741824
  updates: security
  late-commands:
    - touch /target/etc/maestro-vm-ready
  shutdown: poweroff
""", encoding="utf-8")
    run("createvm", "--name", name, "--basefolder", BASE, "--ostype", "Ubuntu22_64", "--register")
    # Install with 2 GiB; lower the small guests to their runtime size afterwards.
    run("modifyvm", name, "--memory", "2048", "--cpus", "2", "--vram", "16",
        "--graphicscontroller", "vmsvga", "--boot1", "disk", "--boot2", "dvd",
        "--nic1", "nat", "--natpf1", f"ssh,tcp,127.0.0.1,{port},,22",
        "--nic2", "intnet", "--intnet2", "EMS-LAB-4G", "--cableconnected2", "on")
    disk = folder / f"{name}.vdi"
    run("createmedium", "disk", "--filename", disk, "--size", disk_size, "--format", "VDI")
    run("storagectl", name, "--name", "SATA", "--add", "sata", "--controller", "IntelAhci")
    run("storageattach", name, "--storagectl", "SATA", "--port", "0", "--device", "0", "--type", "hdd", "--medium", disk)
    run("unattended", "install", name, f"--iso={ISO}", "--user=emsadmin", "--user-password-file=stdin",
        f"--hostname={node_id}.ems.test", "--locale=en_US", "--country=PE", "--time-zone=UTC",
        "--no-install-additions", f"--script-template={template}", "--start-vm=headless", password=auth["password"])
    print(f"{name}: Ubuntu installer started", flush=True)


def clone_vm(node):
    node_id, name, ip, port, memory, _ = node
    if f'"{name}"' in run("list", "vms") or (BASE / name).exists():
        return
    if 'VMState="poweroff"' not in run("showvminfo", "EMS-EPC-CP", "--machinereadable"):
        raise RuntimeError("Source VM must be shut down before cloning")
    run("clonevm", "EMS-EPC-CP", "--name", name, "--basefolder", BASE, "--register", "--mode", "machine")
    run("modifyvm", name, "--memory", memory, "--natpf1", "delete", "ssh")
    run("modifyvm", name, "--natpf1", f"ssh,tcp,127.0.0.1,{port},,22", "--macaddress1", "auto", "--macaddress2", "auto")
    (BASE / f"{node_id}.needs-identity").touch()
    print(f"{name}: independent dynamic clone created (30 GiB virtual capacity)", flush=True)


def initialize_clone(node, auth):
    node_id, name, ip, port, _, _ = node
    pending = BASE / f"{node_id}.needs-identity"
    if not pending.exists():
        return
    # Bootstrap only against the source VM's trusted keys, before replacing them.
    known = paramiko.HostKeys(str(BASE / "known_hosts"))
    with paramiko.SSHClient() as client:
        for kind, key in known["[127.0.0.1]:2230"].items():
            client.get_host_keys().add(f"[127.0.0.1]:{port}", kind, key)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("127.0.0.1", port=port, username="emsadmin", key_filename=str(BASE / "id_rsa"),
                       timeout=5, banner_timeout=5, auth_timeout=5, allow_agent=False, look_for_keys=False)
        script = f"""set -eu
hostnamectl set-hostname {node_id}
sed -i 's/epc-cp/{node_id}/g' /etc/hosts
cat > /etc/netplan/00-installer-config.yaml <<'NETPLAN'
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
    enp0s8:
      dhcp4: false
      addresses: [{ip}/24]
      optional: true
NETPLAN
chmod 600 /etc/netplan/00-installer-config.yaml
if test -f /etc/netplan/50-cloud-init.yaml; then
  mv /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.maestro-original
fi
printf 'network: {{config: disabled}}\\n' > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
touch /etc/cloud/cloud-init.disabled
cat /proc/sys/kernel/random/uuid | tr -d '-' > /etc/machine-id
ln -sf /etc/machine-id /var/lib/dbus/machine-id
rm -f /etc/ssh/ssh_host_*key /etc/ssh/ssh_host_*key.pub
ssh-keygen -A
netplan generate
"""
        stdin, stdout, _ = client.exec_command("sudo -S -p '' /bin/bash -s", timeout=60)
        stdin.write(auth["password"] + "\n" + script)
        stdin.channel.shutdown_write()
        stdout.read()
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(f"{name}: identity initialization failed")
        with client.open_sftp() as sftp:
            for filename, key_class in [("ssh_host_ed25519_key.pub", paramiko.Ed25519Key), ("ssh_host_rsa_key.pub", paramiko.RSAKey), ("ssh_host_ecdsa_key.pub", paramiko.ECDSAKey)]:
                import base64
                with sftp.open(f"/etc/ssh/{filename}") as stream:
                    kind, data, *_ = stream.read().decode().split()
                known.add(f"[127.0.0.1]:{port}", kind, key_class(data=base64.b64decode(data)))
        known.save(str(BASE / "known_hosts"))
        pending.unlink()
        stdin, _, _ = client.exec_command("sudo -S -p '' /sbin/reboot")
        stdin.write(auth["password"] + "\n")
        stdin.flush()
    print(f"{name}: unique hostname, machine ID, SSH keys and IP assigned; rebooting", flush=True)
    time.sleep(20)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Only verify SSH and private IPs")
    parser.add_argument("--node", choices=[node[0] for node in NODES])
    args = parser.parse_args()
    nodes = [node for node in NODES if not args.node or node[0] == args.node]
    if args.check:
        for node in nodes:
            try:
                print(json.dumps(verify(node)), flush=True)
            except Exception as exc:
                print(f"{node[1]}: {type(exc).__name__}", flush=True)
        return
    if BASE.resolve().is_relative_to(ROOT.resolve()):
        raise SystemExit("VM storage must be outside the repository")
    with ISO.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != ISO_SHA256:
            raise SystemExit("ISO checksum mismatch")
    auth = credentials()
    for node in nodes:
        if node[0] == "epc-cp":
            create(node, auth)
        else:
            clone_vm(node)
        name = node[1]
        deadline = time.monotonic() + 2400
        while time.monotonic() < deadline:
            info = run("showvminfo", name, "--machinereadable")
            if 'VMState="poweroff"' in info:
                run("modifyvm", name, "--memory", node[4], "--boot1", "disk", "--boot2", "none")
                run("startvm", name, "--type", "headless")
            try:
                initialize_clone(node, auth)
                result = verify(node)
                print(json.dumps(result), flush=True)
                # Keep other installers from competing for host memory.
                run("controlvm", name, "acpipowerbutton")
                for _ in range(60):
                    if 'VMState="poweroff"' in run("showvminfo", name, "--machinereadable"):
                        break
                    time.sleep(2)
                else:
                    raise RuntimeError(f"{name}: shutdown timed out")
                run("storageattach", name, "--storagectl", "IDE", "--port", "0", "--device", "0", "--type", "dvddrive", "--medium", "none")
                break
            except (paramiko.SSHException, OSError, EOFError, RuntimeError):
                print(f"{name}: waiting for installed Ubuntu/SSH", flush=True)
                time.sleep(30)
        else:
            raise SystemExit(f"{name}: install timeout; inspect VM console/logs")
    print("All requested VMs installed and verified. Left powered off to conserve RAM.", flush=True)


if __name__ == "__main__":
    main()

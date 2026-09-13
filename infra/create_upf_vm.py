"""Provision only the new UPF VM; existing VMs are never modified.

Run using backend/.venv Python. Reuses the local lab administrator password
through stdin, never as a command-line argument or a source-file literal.
The generated unattended media remain private local VirtualBox artifacts.
"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.core.config import Settings

VBOX = Path('C:/Program Files/Oracle/VirtualBox/VBoxManage.exe')
VM = 'EMS-UPF-01'
ISO = ROOT.parent / 'ubuntu-22.04.5-live-server-amd64.iso'
BASE = Path.home() / 'VirtualBox VMs' / VM


def main():
    settings = Settings(_env_file=ROOT / 'backend/.env')
    password = settings.ssh_password
    if not password or not ISO.is_file():
        raise SystemExit('Installer ISO or existing lab password unavailable.')

    def run(*args, secret_input=None):
        result = subprocess.run(
            [str(VBOX), *map(str, args)], input=secret_input,
            capture_output=True, text=True, encoding='utf-8', errors='replace',
        )
        if result.returncode:
            detail = (result.stdout + result.stderr).replace(password, '[REDACTED]')
            raise RuntimeError(detail)
        # Unattended output can contain authentication material: never print it.
        return result.stdout

    inventory = run('list', 'vms')
    if f'"{VM}"' in inventory or BASE.exists():
        raise SystemExit('Target already exists. Inspect it; do not recreate or overwrite.')
    run('createvm', '--name', VM, '--ostype', 'Ubuntu22_64', '--register')
    run('modifyvm', VM, '--memory', '2048', '--cpus', '2', '--vram', '16',
        '--graphicscontroller', 'vmsvga', '--boot1', 'disk', '--boot2', 'dvd',
        '--nic1', 'nat', '--natpf1', 'ssh,tcp,127.0.0.1,2223,,22',
        '--nic2', 'intnet', '--intnet2', 'EMS-LAB-N4', '--cableconnected2', 'on')
    disk = BASE / 'EMS-UPF-01.vdi'
    run('createmedium', 'disk', '--filename', disk, '--size', '25600', '--format', 'VDI')
    run('storagectl', VM, '--name', 'SATA', '--add', 'sata', '--controller', 'IntelAhci')
    run('storageattach', VM, '--storagectl', 'SATA', '--port', '0', '--device', '0',
        '--type', 'hdd', '--medium', disk)
    run('unattended', 'install', VM, f'--iso={ISO}', '--user=emsadmin',
        '--user-password-file=stdin', '--hostname=upf-01.ems.test',
        '--locale=en_US', '--country=PE', '--time-zone=UTC',
        '--no-install-additions', f'--script-template={ROOT / "infra/upf_autoinstall.yaml"}',
        '--start-vm=headless', secret_input=password + '\n')
    print('Created EMS-UPF-01: 2 vCPU, 2 GiB, dynamic 25 GiB disk.')
    print('Ubuntu installation started headless; SSH will be 127.0.0.1:2223.')
    print('Private interface 10.210.50.8/24 on EMS-LAB-N4; no core changes.')


if __name__ == '__main__':
    main()

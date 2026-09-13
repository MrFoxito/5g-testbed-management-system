import subprocess
import time
from pathlib import Path

VBOX = Path("C:/Program Files/Oracle/VirtualBox/VBoxManage.exe")

def run_vbox(*args):
    cmd = [str(VBOX), *map(str, args)]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"VBoxManage failed: {res.stdout}\n{res.stderr}")
    return res.stdout

def provision_vm(name: str, port: int, mem_mb: int = 1536):
    print(f"=== Provisioning {name} (Port {port}, RAM {mem_mb} MB) ===")
    vms = run_vbox("list", "vms")
    if f'"{name}"' in vms:
        print(f"VM {name} already exists in inventory.")
    else:
        print(f"Cloning {name} from EMS-UPF-01 snapshot base-upf...")
        run_vbox("clonevm", "EMS-UPF-01", "--snapshot", "base-upf", "--name", name, "--register", "--mode", "machine")

    # In case the clone was created in 'saved' state from the snapshot, discard state to allow modifyvm
    try:
        run_vbox("discardstate", name)
    except Exception:
        pass

    print(f"Configuring {name}...")
    run_vbox("modifyvm", name, "--memory", str(mem_mb), "--cpus", "1")
    run_vbox("modifyvm", name, "--macaddress2", "auto")
    try:
        run_vbox("modifyvm", name, "--natpf1", "delete", "ssh")
    except Exception:
        pass
    run_vbox("modifyvm", name, "--natpf1", f"ssh,tcp,127.0.0.1,{port},,22")
    print(f"{name} configured successfully.")

    running = run_vbox("list", "runningvms")
    if f'"{name}"' not in running:
        print(f"Starting {name} headless...")
        run_vbox("startvm", name, "--type", "headless")
        print(f"{name} started.")
    else:
        print(f"{name} is already running.")

if __name__ == "__main__":
    provision_vm("EMS-GNB-01", 2225, 1536)
    provision_vm("EMS-UE-01", 2226, 1536)
    print("Provisioning completed for EMS-GNB-01 and EMS-UE-01.")

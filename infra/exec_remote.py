import argparse
import sys
import paramiko

VMS = {
    "core": {"host": "127.0.0.1", "port": 2222, "user": "emsadmin", "pass": "1506"},
    "upf": {"host": "127.0.0.1", "port": 2223, "user": "emsadmin", "pass": "1506"},
}

def run_cmd(vm_name: str, cmd: str, sudo: bool = False, timeout: int = 120):
    if vm_name not in VMS:
        raise ValueError(f"Unknown VM: {vm_name}")
    cfg = VMS[vm_name]
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(cfg["host"], port=cfg["port"], username=cfg["user"], password=cfg["pass"], timeout=10)
        if sudo:
            full_cmd = f"printf '%s\\n' '{cfg['pass']}' | sudo -S bash -c {cmd!r}"
        else:
            full_cmd = cmd
        
        stdin, stdout, stderr = client.exec_command(full_cmd, timeout=timeout)
        exit_status = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        return exit_status, out, err
    finally:
        client.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("vm", choices=["core", "upf"])
    parser.add_argument("cmd")
    parser.add_argument("--sudo", action="store_true")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    status, out, err = run_cmd(args.vm, args.cmd, sudo=args.sudo, timeout=args.timeout)
    if out:
        sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
    if err:
        sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
    sys.exit(status)

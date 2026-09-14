"""Start, stop or inspect only the five MAEstro 4G VMs."""
import argparse
import json
import time

from provision_vms import BASE, NODES, run, verify


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["start", "stop", "status"])
    args = parser.parse_args()
    if args.action == "start":
        running = run("list", "runningvms")
        known_names = {node[1] for node in NODES}
        others = [line for line in running.splitlines() if line.split('"')[1] not in known_names]
        if others:
            raise SystemExit("Other VMs are running. Shut down the other laboratory before starting 4G.")
        if not all((BASE / f"{node[0]}.verified").is_file() for node in NODES):
            raise SystemExit("Provision and verify all five VMs first.")
    failed = False
    for node in NODES:
        name = node[1]
        info = run("showvminfo", name, "--machinereadable")
        running = 'VMState="running"' in info
        if args.action == "start" and not running:
            run("startvm", name, "--type", "headless")
            print(f"{name}: started", flush=True)
        elif args.action == "stop" and running:
            run("controlvm", name, "acpipowerbutton")
            for _ in range(60):
                if 'VMState="poweroff"' in run("showvminfo", name, "--machinereadable"):
                    break
                time.sleep(2)
            else:
                failed = True
                print(f"{name}: graceful shutdown timed out; not forcing power off", flush=True)
        elif args.action == "status":
            try:
                print(json.dumps(verify(node)), flush=True)
            except Exception as exc:
                failed = True
                print(f"{name}: no verified SSH connection ({type(exc).__name__})", flush=True)
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

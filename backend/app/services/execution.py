import asyncio
import shlex
import shutil
from abc import ABC, abstractmethod

from app.core.config import get_settings


class ExecutionError(RuntimeError):
    pass


class ExecutionAdapter(ABC):
    @abstractmethod
    async def start_service(self, unit: str) -> None: ...

    @abstractmethod
    async def stop_service(self, unit: str) -> None: ...

    @abstractmethod
    async def service_status(self, unit: str) -> str: ...

    @abstractmethod
    async def logs(self, unit: str, lines: int = 100) -> list[str]: ...


class SimulatedExecutionAdapter(ExecutionAdapter):
    def __init__(self) -> None:
        self.running: set[str] = set()

    async def start_service(self, unit: str) -> None:
        await asyncio.sleep(0.03)
        self.running.add(unit)

    async def stop_service(self, unit: str) -> None:
        await asyncio.sleep(0.02)
        self.running.discard(unit)

    async def service_status(self, unit: str) -> str:
        return "running" if unit in self.running else "stopped"

    async def logs(self, unit: str, lines: int = 100) -> list[str]:
        state = await self.service_status(unit)
        return [f"[INFO] {unit}: execution_mode=simulated state={state}"]


class LocalExecutionAdapter(ExecutionAdapter):
    """Controls only units declared in the scenario catalog; never invokes a shell."""

    def __init__(self, allowed_units: set[str]) -> None:
        self.allowed_units = allowed_units
        if not shutil.which("systemctl"):
            raise ExecutionError("systemctl no está disponible")

    def _validate(self, unit: str) -> None:
        if unit not in self.allowed_units:
            raise ExecutionError(f"Unidad no permitida: {unit}")

    async def _run(self, *args: str) -> str:
        process = await asyncio.create_subprocess_exec(
            *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=15)
        if process.returncode != 0:
            raise ExecutionError(stderr.decode(errors="replace").strip() or "Falló la operación")
        return stdout.decode(errors="replace")

    async def start_service(self, unit: str) -> None:
        self._validate(unit)
        await self._run("sudo", "-n", "systemctl", "start", unit)

    async def stop_service(self, unit: str) -> None:
        self._validate(unit)
        await self._run("sudo", "-n", "systemctl", "stop", unit)

    async def service_status(self, unit: str) -> str:
        self._validate(unit)
        try:
            state = (await self._run("systemctl", "is-active", unit)).strip()
            return "running" if state == "active" else "degraded"
        except ExecutionError:
            return "stopped"

    async def logs(self, unit: str, lines: int = 100) -> list[str]:
        self._validate(unit)
        output = await self._run("journalctl", "-u", unit, "-n", str(min(lines, 500)), "--no-pager")
        return output.splitlines()


class RemoteExecutionAdapter(ExecutionAdapter):
    """Observes/manages a pre-existing testbed through SSH."""

    def __init__(self, allowed_units: set[str]) -> None:
        settings = get_settings()
        if not settings.testbed_host or not settings.ssh_user:
            raise ExecutionError("Faltan EMS_TESTBED_HOST o EMS_SSH_USER")
        if not settings.ssh_key_path and not settings.ssh_password:
            raise ExecutionError("Se requiere EMS_SSH_KEY_PATH o EMS_SSH_PASSWORD")
        self.allowed_units = allowed_units
        self.settings = settings

    def _validate(self, unit: str) -> None:
        if unit not in self.allowed_units:
            raise ExecutionError(f"Unidad no permitida: {unit}")

    def _execute_sync(self, command: str) -> str:
        import paramiko
        client = paramiko.SSHClient()
        if self.settings.ssh_strict_host_key:
            client.load_system_host_keys()
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
        else:
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            connect_kwargs = {
                "hostname": self.settings.testbed_host,
                "port": self.settings.ssh_port,
                "username": self.settings.ssh_user,
                "look_for_keys": bool(self.settings.ssh_key_path),
                "allow_agent": False,
                "timeout": 10,
            }
            if self.settings.ssh_key_path:
                connect_kwargs["key_filename"] = str(self.settings.ssh_key_path)
            if self.settings.ssh_password:
                connect_kwargs["password"] = self.settings.ssh_password

            client.connect(**connect_kwargs)
            _, stdout, stderr = client.exec_command(command, timeout=20)
            exit_code = stdout.channel.recv_exit_status()
            output = stdout.read().decode(errors="replace")
            error = stderr.read().decode(errors="replace")
            if exit_code != 0:
                raise ExecutionError(error.strip() or output.strip() or f"SSH finalizó con código {exit_code}")
            return output
        finally:
            client.close()

    def _sudo_cmd(self, subcmd: str) -> str:
        if self.settings.ssh_password:
            escaped_pass = shlex.quote(self.settings.ssh_password)
            return f"printf '%s\\n' {escaped_pass} | sudo -S {subcmd}"
        return f"sudo -n {subcmd}"

    async def _run(self, command: str) -> str:
        return await asyncio.to_thread(self._execute_sync, command)

    async def start_service(self, unit: str) -> None:
        self._validate(unit)
        cmd = self._sudo_cmd(f"systemctl start {shlex.quote(unit)}")
        await self._run(cmd)

    async def stop_service(self, unit: str) -> None:
        self._validate(unit)
        cmd = self._sudo_cmd(f"systemctl stop {shlex.quote(unit)}")
        await self._run(cmd)

    async def service_status(self, unit: str) -> str:
        self._validate(unit)
        try:
            state = (await self._run(f"systemctl is-active {shlex.quote(unit)}")).strip()
            return "running" if state == "active" else "degraded"
        except ExecutionError:
            return "stopped"

    async def logs(self, unit: str, lines: int = 100) -> list[str]:
        self._validate(unit)
        safe_lines = min(max(lines, 1), 500)
        output = await self._run(f"journalctl -u {shlex.quote(unit)} -n {safe_lines} --no-pager")
        return output.splitlines()


def build_adapter(allowed_units: set[str]) -> ExecutionAdapter:
    mode = get_settings().execution_mode
    if mode == "local":
        return LocalExecutionAdapter(allowed_units)
    if mode == "remote":
        return RemoteExecutionAdapter(allowed_units)
    return SimulatedExecutionAdapter()

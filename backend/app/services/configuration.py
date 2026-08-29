import difflib
import shutil
from datetime import datetime, timezone
from pathlib import Path

import yaml

from app.core.config import get_settings


class ConfigurationError(ValueError):
    pass


class ConfigurationService:
    def resolve(self, relative_path: str) -> Path:
        if Path(relative_path).is_absolute() or ".." in Path(relative_path).parts:
            raise ConfigurationError("La ruta debe ser relativa y no puede contener '..'")
        roots = get_settings().allowed_config_roots
        target = (roots[0] / relative_path).resolve()
        if not any(target.is_relative_to(root.resolve()) for root in roots):
            raise ConfigurationError("Ruta fuera de los directorios permitidos")
        if target.suffix not in {".yaml", ".yml"}:
            raise ConfigurationError("Solo se permiten archivos YAML")
        return target

    def read(self, relative_path: str) -> str:
        target = self.resolve(relative_path)
        if not target.exists():
            raise FileNotFoundError(relative_path)
        return target.read_text(encoding="utf-8")

    def validate(self, content: str) -> dict:
        parsed = yaml.safe_load(content)
        if not isinstance(parsed, dict):
            raise ConfigurationError("La raíz del YAML debe ser un objeto")
        return parsed

    def diff(self, relative_path: str, content: str) -> str:
        old = self.read(relative_path) if self.resolve(relative_path).exists() else ""
        return "".join(difflib.unified_diff(old.splitlines(True), content.splitlines(True), fromfile="actual", tofile="propuesto"))

    def write(self, relative_path: str, content: str) -> dict:
        self.validate(content)
        target = self.resolve(relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        backup = None
        if target.exists():
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = get_settings().backup_dir / f"{target.name}.{stamp}.bak"
            shutil.copy2(target, backup)
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(target)
        return {"path": relative_path, "backup": backup.name if backup else None}

    def restore(self, relative_path: str) -> dict:
        target = self.resolve(relative_path)
        backups = sorted(get_settings().backup_dir.glob(f"{target.name}.*.bak"), reverse=True)
        if not backups:
            raise FileNotFoundError("No existe respaldo")
        shutil.copy2(backups[0], target)
        return {"path": relative_path, "restored_from": backups[0].name}


configuration_service = ConfigurationService()

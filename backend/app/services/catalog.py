import json
from functools import lru_cache

from app.core.config import get_settings


class CatalogError(RuntimeError):
    pass


@lru_cache
def load_catalog() -> dict[str, dict]:
    settings = get_settings()
    path = settings.catalog_path
    try:
        catalog = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"No se pudo cargar el catálogo {path}: {exc}") from exc
    if not isinstance(catalog, dict) or not catalog:
        raise CatalogError("El catálogo debe contener al menos un testbed")
    try:
        profiles = json.loads(settings.profiles_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"No se pudieron cargar los perfiles: {exc}") from exc

    for scenario_id, scenario in catalog.items():
        components, nodes = scenario.get("components"), scenario.get("nodes")
        if not isinstance(components, list) or not components or not isinstance(nodes, list) or not nodes:
            raise CatalogError(f"{scenario_id}: nodes y components deben ser listas no vacías")
        component_ids = {item.get("id") for item in components}
        node_ids = {item.get("id") for item in nodes}
        if None in component_ids or len(component_ids) != len(components):
            raise CatalogError(f"{scenario_id}: IDs de componentes inválidos o repetidos")
        for component in components:
            if component.get("node_id") not in node_ids:
                raise CatalogError(f"{scenario_id}/{component['id']}: nodo inexistente")
            missing = set(component.get("depends_on", [])) - component_ids
            if missing:
                raise CatalogError(f"{scenario_id}/{component['id']}: dependencias inexistentes {sorted(missing)}")
            profile = profiles.get(
                f"{scenario.get('technology')}:{component['id']}",
                profiles.get(f"common:{component['id']}", {}),
            )
            component.update(profile)
    return catalog

import json
from copy import deepcopy

from pymongo import MongoClient

from app.core.config import get_settings
from app.models import SubscriberCreate


def mask_secret(value: str | None) -> str | None:
    return f"{value[:4]}{'•' * 24}{value[-4:]}" if value else None


class SubscriberService:
    def __init__(self) -> None:
        self.memory: dict[str, dict] = {}

    def _remote_mongosh(self, js_code: str) -> str:
        from app.services.scenarios import scenario_manager
        from app.services.execution import RemoteExecutionAdapter
        adapter = scenario_manager.adapter
        if isinstance(adapter, RemoteExecutionAdapter):
            cmd = f'mongosh open5gs --quiet --eval "{js_code}"'
            return adapter._execute_sync(cmd)
        return ""

    def _collection(self):
        settings = get_settings()
        if not settings.enable_mongo:
            return None
        return MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=2000)[settings.mongo_database]["subscribers"]

    def _document(self, item: SubscriberCreate) -> dict:
        session = {"name": item.apn_dnn, "type": 3}
        slice_data = {"sst": item.sst, "default_indicator": True, "session": [session]}
        if item.sd:
            slice_data["sd"] = item.sd
        return {
            "imsi": item.imsi,
            "subscriber_status": 0,
            "network_access_mode": 0,
            "security": {"k": item.key, "opc": item.opc, "amf": item.amf},
            "slice": [slice_data],
        }

    def _public(self, document: dict) -> dict:
        result = deepcopy(document)
        result.pop("_id", None)
        if "security" in result:
            result["security"]["k"] = mask_secret(result["security"].get("k"))
            result["security"]["opc"] = mask_secret(result["security"].get("opc"))
        return result

    def list(self) -> list[dict]:
        settings = get_settings()
        if settings.execution_mode == "remote":
            try:
                js = "JSON.stringify(db.subscribers.find().toArray())"
                raw = self._remote_mongosh(js)
                if raw.strip():
                    docs = json.loads(raw.strip())
                    return [self._public(doc) for doc in docs]
            except Exception:
                pass

        collection = self._collection()
        documents = list(collection.find({})) if collection is not None else list(self.memory.values())
        return [self._public(document) for document in documents]

    def create(self, item: SubscriberCreate) -> dict:
        document = self._document(item)
        settings = get_settings()
        if settings.execution_mode == "remote":
            try:
                check_js = f'db.subscribers.countDocuments({{imsi: "{item.imsi}"}})'
                count = int(self._remote_mongosh(check_js).strip() or "0")
                if count > 0:
                    raise ValueError("El IMSI ya existe")
                doc_json = json.dumps(document)
                insert_js = f"db.subscribers.insertOne({doc_json})"
                self._remote_mongosh(insert_js)
                return self._public(document)
            except ValueError:
                raise
            except Exception as exc:
                raise RuntimeError(f"Error creando suscriptor en MongoDB remoto: {exc}")

        collection = self._collection()
        if collection is not None:
            if collection.find_one({"imsi": item.imsi}):
                raise ValueError("El IMSI ya existe")
            collection.insert_one(document)
        else:
            if item.imsi in self.memory:
                raise ValueError("El IMSI ya existe")
            self.memory[item.imsi] = document
        return self._public(document)

    def delete(self, imsi: str) -> bool:
        settings = get_settings()
        if settings.execution_mode == "remote":
            try:
                del_js = f'db.subscribers.deleteOne({{imsi: "{imsi}"}}).deletedCount'
                count = int(self._remote_mongosh(del_js).strip() or "0")
                return count > 0
            except Exception:
                return False

        collection = self._collection()
        if collection is not None:
            return collection.delete_one({"imsi": imsi}).deleted_count == 1
        return self.memory.pop(imsi, None) is not None


subscriber_service = SubscriberService()

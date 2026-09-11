import json
from copy import deepcopy

from pymongo import MongoClient

from app.core.config import get_settings
from app.models import SubscriberCreate, SubscriberUpdate


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

    def get_live_status(self, target_imsi: str | None = None) -> dict[str, dict]:
        settings = get_settings()
        statuses: dict[str, dict] = {}
        if settings.execution_mode == "remote":
            from app.services.scenarios import scenario_manager
            from app.services.execution import RemoteExecutionAdapter
            adapter = scenario_manager.adapter
            if isinstance(adapter, RemoteExecutionAdapter):
                try:
                    dump_out = adapter._execute_sync("/home/emsadmin/UERANSIM/build/nr-cli --dump 2>/dev/null || true")
                    imsi_entries = [line.strip() for line in dump_out.splitlines() if line.strip().startswith("imsi-")]
                    for entry in imsi_entries:
                        imsi_clean = entry.replace("imsi-", "")
                        if target_imsi and imsi_clean != target_imsi:
                            continue
                        stat_out = adapter._execute_sync(f"/home/emsadmin/UERANSIM/build/nr-cli {entry} --exec status 2>/dev/null || true")
                        ps_out = adapter._execute_sync(f"/home/emsadmin/UERANSIM/build/nr-cli {entry} --exec ps-list 2>/dev/null || true")

                        cm_state = "CM-IDLE"
                        rm_state = "RM-DEREGISTERED"
                        mm_state = "MM-DEREGISTERED"
                        guti = None
                        cell_id = None
                        tac = None
                        for line in stat_out.splitlines():
                            if "cm-state:" in line: cm_state = line.split(":", 1)[1].strip()
                            elif "rm-state:" in line: rm_state = line.split(":", 1)[1].strip()
                            elif "mm-state:" in line: mm_state = line.split(":", 1)[1].strip()
                            elif "current-cell:" in line: cell_id = line.split(":", 1)[1].strip()
                            elif "current-tac:" in line: tac = line.split(":", 1)[1].strip()
                            elif "tmsi:" in line and not guti: guti = line.strip()

                        pdu_sessions = []
                        current_pdu: dict = {}
                        for line in ps_out.splitlines():
                            line_str = line.strip()
                            if line_str.startswith("PDU Session"):
                                if current_pdu: pdu_sessions.append(current_pdu)
                                current_pdu = {"session_id": line_str.replace(":", "").strip()}
                            elif "state:" in line_str and current_pdu:
                                current_pdu["state"] = line_str.split(":", 1)[1].strip()
                            elif "session-type:" in line_str and current_pdu:
                                current_pdu["type"] = line_str.split(":", 1)[1].strip()
                            elif "apn:" in line_str and current_pdu:
                                current_pdu["apn"] = line_str.split(":", 1)[1].strip()
                            elif "address:" in line_str and current_pdu:
                                current_pdu["address"] = line_str.split(":", 1)[1].strip()
                            elif "ambr:" in line_str and current_pdu:
                                current_pdu["ambr"] = line_str.split(":", 1)[1].strip()
                        if current_pdu:
                            pdu_sessions.append(current_pdu)

                        is_registered = "REGISTERED" in rm_state
                        statuses[imsi_clean] = {
                            "registered": is_registered,
                            "cm_state": cm_state,
                            "rm_state": rm_state,
                            "mm_state": mm_state,
                            "cell_id": cell_id,
                            "tac": tac,
                            "guti": guti,
                            "pdu_sessions": pdu_sessions,
                            "active_ip": pdu_sessions[0]["address"] if pdu_sessions and "address" in pdu_sessions[0] else None,
                        }
                except Exception:
                    pass
        return statuses

    def list(self) -> list[dict]:
        settings = get_settings()
        documents = []
        if settings.execution_mode == "remote":
            try:
                js = "JSON.stringify(db.subscribers.find().toArray())"
                raw = self._remote_mongosh(js)
                if raw.strip():
                    documents = json.loads(raw.strip())
            except Exception:
                pass
        if not documents:
            collection = self._collection()
            documents = list(collection.find({})) if collection is not None else list(self.memory.values())

        public_docs = [self._public(doc) for doc in documents]
        live_statuses = self.get_live_status()
        for doc in public_docs:
            imsi = doc.get("imsi")
            doc["live_status"] = live_statuses.get(imsi) or {
                "registered": False,
                "cm_state": "CM-IDLE",
                "rm_state": "RM-DEREGISTERED",
                "mm_state": "MM-DEREGISTERED",
                "cell_id": None,
                "tac": None,
                "guti": None,
                "pdu_sessions": [],
                "active_ip": None,
            }
        return public_docs

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
                res = self._public(document)
                res["live_status"] = {
                    "registered": False, "cm_state": "CM-IDLE", "rm_state": "RM-DEREGISTERED", "mm_state": "MM-DEREGISTERED",
                    "cell_id": None, "tac": None, "guti": None, "pdu_sessions": [], "active_ip": None
                }
                return res
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
        res = self._public(document)
        res["live_status"] = {
            "registered": False, "cm_state": "CM-IDLE", "rm_state": "RM-DEREGISTERED", "mm_state": "MM-DEREGISTERED",
            "cell_id": None, "tac": None, "guti": None, "pdu_sessions": [], "active_ip": None
        }
        return res

    def update(self, imsi: str, item: SubscriberUpdate) -> dict:
        settings = get_settings()
        if settings.execution_mode == "remote":
            check_js = f'db.subscribers.findOne({{imsi: "{imsi}"}})'
            existing_raw = self._remote_mongosh(f'JSON.stringify({check_js})').strip()
            if not existing_raw or existing_raw == "null":
                raise KeyError("Suscriptor no encontrado")
            doc = json.loads(existing_raw)

            if item.key or item.opc or item.amf:
                sec = doc.get("security", {})
                if item.key: sec["k"] = item.key
                if item.opc: sec["opc"] = item.opc
                if item.amf: sec["amf"] = item.amf
                doc["security"] = sec

            if item.sst is not None or item.sd is not None or item.apn_dnn:
                slices = doc.get("slice", [{}])
                if not slices: slices = [{}]
                first_slice = slices[0]
                if item.sst is not None: first_slice["sst"] = item.sst
                if item.sd is not None: first_slice["sd"] = item.sd
                if item.apn_dnn:
                    sessions = first_slice.get("session", [{}])
                    if not sessions: sessions = [{}]
                    sessions[0]["name"] = item.apn_dnn
                    sessions[0]["type"] = 3
                    first_slice["session"] = sessions
                doc["slice"] = [first_slice]

            doc.pop("_id", None)
            update_js = f'db.subscribers.replaceOne({{imsi: "{imsi}"}}, {json.dumps(doc)})'
            self._remote_mongosh(update_js)
            res = self._public(doc)
            live = self.get_live_status(imsi).get(imsi)
            res["live_status"] = live or {
                "registered": False, "cm_state": "CM-IDLE", "rm_state": "RM-DEREGISTERED", "mm_state": "MM-DEREGISTERED",
                "cell_id": None, "tac": None, "guti": None, "pdu_sessions": [], "active_ip": None
            }
            return res

        collection = self._collection()
        doc = collection.find_one({"imsi": imsi}) if collection is not None else self.memory.get(imsi)
        if not doc:
            raise KeyError("Suscriptor no encontrado")
        doc = deepcopy(doc)
        if item.key or item.opc or item.amf:
            sec = doc.get("security", {})
            if item.key: sec["k"] = item.key
            if item.opc: sec["opc"] = item.opc
            if item.amf: sec["amf"] = item.amf
            doc["security"] = sec
        if item.sst is not None or item.sd is not None or item.apn_dnn:
            slices = doc.get("slice", [{}])
            if not slices: slices = [{}]
            first_slice = slices[0]
            if item.sst is not None: first_slice["sst"] = item.sst
            if item.sd is not None: first_slice["sd"] = item.sd
            if item.apn_dnn:
                sessions = first_slice.get("session", [{}])
                if not sessions: sessions = [{}]
                sessions[0]["name"] = item.apn_dnn
                sessions[0]["type"] = 3
                first_slice["session"] = sessions
            doc["slice"] = [first_slice]
        if collection is not None:
            collection.replace_one({"imsi": imsi}, doc)
        else:
            self.memory[imsi] = doc
        res = self._public(doc)
        res["live_status"] = {
            "registered": False, "cm_state": "CM-IDLE", "rm_state": "RM-DEREGISTERED", "mm_state": "MM-DEREGISTERED",
            "cell_id": None, "tac": None, "guti": None, "pdu_sessions": [], "active_ip": None
        }
        return res

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

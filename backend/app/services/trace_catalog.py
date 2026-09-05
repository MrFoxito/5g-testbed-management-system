from typing import Any


TRACE_PROFILES: dict[str, dict[str, dict[str, Any]]] = {
    "5g-sa": {
        "n2": {
            "label": "N2 · AMF ↔ gNodeB",
            "interface_3gpp": "N2",
            "device": "lo",
            "protocols": ["NGAP", "NAS-5GS", "SCTP"],
            "filter": "sctp port 38412",
            "nf_ids": ["amf", "gnb"],
            "procedures": ["NG Setup", "Registration", "Authentication", "PDU Session"],
        },
        "n3": {
            "label": "N3 · UPF ↔ gNodeB",
            "interface_3gpp": "N3",
            "device": "lo",
            "protocols": ["GTP-U"],
            "filter": "udp port 2152",
            "nf_ids": ["upf", "gnb"],
            "procedures": ["PDU Session", "User Plane"],
        },
        "n4": {
            "label": "N4 · SMF ↔ UPF",
            "interface_3gpp": "N4",
            "device": "lo",
            "protocols": ["PFCP"],
            "filter": "udp port 8805",
            "nf_ids": ["smf", "upf"],
            "procedures": ["PFCP Association", "PFCP Session"],
        },
        "n6": {
            "label": "N6 · UPF ↔ Data Network",
            "interface_3gpp": "N6",
            "device": "ogstun",
            "protocols": ["IPv4", "IPv6", "ICMP"],
            "filter": "ip or ip6",
            "nf_ids": ["upf"],
            "procedures": ["User Plane", "Internet Access"],
        },
        "sbi": {
            "label": "SBI · Service Based Interface",
            "interface_3gpp": "SBI",
            "device": "lo",
            "protocols": ["HTTP/2", "SBI"],
            "filter": "tcp port 7777",
            "nf_ids": ["amf", "smf", "nrf", "scp", "ausf", "udm", "udr", "pcf", "nssf"],
            "procedures": ["NF Discovery", "Authentication", "Session Management"],
        },
    },
    "4g-epc": {
        "s1-mme": {
            "label": "S1-MME · MME ↔ eNodeB",
            "interface_3gpp": "S1-MME",
            "device": "lo",
            "protocols": ["S1AP", "NAS-EPS", "SCTP"],
            "filter": "sctp port 36412",
            "nf_ids": ["mme", "enb"],
            "procedures": ["S1 Setup", "Attach", "Authentication"],
        },
        "s1-u": {
            "label": "S1-U · SGW-U ↔ eNodeB",
            "interface_3gpp": "S1-U",
            "device": "lo",
            "protocols": ["GTP-U"],
            "filter": "udp port 2152",
            "nf_ids": ["sgwu", "enb"],
            "procedures": ["EPS Bearer", "User Plane"],
        },
        "s11": {
            "label": "S11 · MME ↔ SGW-C",
            "interface_3gpp": "S11",
            "device": "lo",
            "protocols": ["GTPv2-C"],
            "filter": "udp port 2123",
            "nf_ids": ["mme", "sgwc"],
            "procedures": ["Create Session", "Modify Bearer"],
        },
        "s6a": {
            "label": "S6a · MME ↔ HSS",
            "interface_3gpp": "S6a",
            "device": "lo",
            "protocols": ["Diameter"],
            "filter": "tcp port 3868 or sctp port 3868",
            "nf_ids": ["mme", "hss"],
            "procedures": ["Authentication Information", "Update Location"],
        },
        "sgi": {
            "label": "SGi · PGW-U ↔ Data Network",
            "interface_3gpp": "SGi",
            "device": "ogstun",
            "protocols": ["IPv4", "IPv6", "ICMP"],
            "filter": "ip or ip6",
            "nf_ids": ["upf"],
            "procedures": ["User Plane", "Internet Access"],
        },
    },
}


SUBSCRIBER_PROCEDURES = [
    {"id": "registration", "label": "Registration", "interfaces": ["N1/N2"]},
    {"id": "authentication", "label": "5G-AKA Authentication", "interfaces": ["N1/N2", "SBI"]},
    {"id": "pdu-session", "label": "PDU Session Establishment", "interfaces": ["N1/N2", "N4", "N3"]},
    {"id": "user-plane", "label": "User Plane", "interfaces": ["N3", "N6"]},
]


def profile(scenario_id: str, capture_point: str) -> dict[str, Any]:
    try:
        return {"id": capture_point, **TRACE_PROFILES[scenario_id][capture_point]}
    except KeyError as exc:
        raise KeyError(f"Punto de captura no soportado: {scenario_id}/{capture_point}") from exc


def public_profiles(scenario_id: str, components: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {component["id"]: component for component in components}
    result = []
    for point_id, item in TRACE_PROFILES.get(scenario_id, {}).items():
        node_ids = sorted({by_id[nf]["node_id"] for nf in item["nf_ids"] if nf in by_id})
        result.append(
            {
                "id": point_id,
                "label": item["label"],
                "capture_agent_id": "primary",
                "interface_3gpp": item["interface_3gpp"],
                "device_label": item["device"],
                "protocols": item["protocols"],
                "nf_ids": item["nf_ids"],
                "node_ids": node_ids,
                "procedures": item["procedures"],
            }
        )
    return result


def subscriber_capture_profile(include_sbi: bool) -> dict[str, Any]:
    ports = ["sctp port 38412", "udp port 8805", "udp port 2152"]
    interfaces = ["N1/N2", "N4", "N3"]
    protocols = ["NGAP", "NAS-5GS", "PFCP", "GTP-U"]
    if include_sbi:
        ports.append("tcp port 7777")
        interfaces.append("SBI")
        protocols.extend(["HTTP/2", "SBI"])
    return {
        "id": "subscriber-5g",
        "label": "Subscriber E2E · N1/N2 + N4 + N3" + (" + SBI" if include_sbi else ""),
        "interface_3gpp": interfaces,
        "device": "any",
        "protocols": protocols,
        "filter": " or ".join(ports),
        "nf_ids": ["ue", "gnb", "amf", "ausf", "udm", "smf", "upf"],
    }

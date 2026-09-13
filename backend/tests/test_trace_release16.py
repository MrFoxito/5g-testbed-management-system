from app.services.trace_analysis import TSHARK_FIELDS, build_trace_analysis, subscriber_hash
from app.services.trace_release16 import POLICY_VERSION


def analyze(*rows, **task):
    data = []
    for n, values in enumerate(rows, 1):
        row = {"frame.number": str(n), "frame.time_epoch": str(n), **values}
        data.append("\t".join(f'"{row.get(k, "")}"' for k in TSHARK_FIELDS))
    return build_trace_analysis({"id": "r16-test", "scenario_id": "5g-sa", "procedures": ["registration", "authentication", "pdu-session"], **task}, "\n".join(data), log_markers={"registration": True, "pdu_session": True})


def nas(message, reverse=False, **fields):
    return {"_ws.col.Protocol": "NGAP/NAS-5GS", "_ws.col.Info": message,
            "ip.src": "127.0.0.5" if reverse else "127.0.0.1",
            "ip.dst": "127.0.0.1" if reverse else "127.0.0.5",
            "ngap.RAN_UE_NGAP_ID": "0", **fields}


def test_no_fabricated_radio_security_pdu_or_rrc():
    a = analyze(nas("Security mode command", True), nas("UplinkNASTransport"),
        nas("InitialContextSetupResponse"), nas("UplinkNASTransport"), nas("PDUSessionResourceSetupResponse"))
    assert len(a["events"]) == 5
    assert not any(e["source_nf"] == "UE" or e["target_nf"] == "UE" for e in a["events"])
    assert a["events"][1]["message"] == "UplinkNASTransport"
    assert a["events"][3]["message"] == "UplinkNASTransport"
    assert a["analysis_policy"] == POLICY_VERSION


def test_aka_response_and_logs_do_not_prove_success():
    a = analyze(nas("Authentication request", True), nas("Authentication response"))
    assert a["outcome"] == "partial"
    assert a["procedures"][1]["status"] == "partial"
    assert all(e["status"] != "success" for e in a["events"])


def test_pfcp_response_does_not_prove_nas_accept():
    a = analyze({"_ws.col.Protocol": "PFCP", "_ws.col.Info": "PFCP Session Establishment Response"})
    assert a["procedures"][2]["status"] == "not-observed"


def test_scp_bsf_nrf_and_http_responses_preserve_actual_endpoints():
    a = analyze({"_ws.col.Protocol": "HTTP2", "ip.src": "127.0.0.200", "ip.dst": "127.0.0.12",
        "http2.headers.method": "GET", "http2.headers.path": "/nudm-sdm/v2/imsi-999700000000001/am-data"},
        {"_ws.col.Protocol": "HTTP2", "ip.src": "127.0.0.13", "ip.dst": "127.0.0.20",
         "http2.headers.path": "/nbsf-management/v1/pcfBindings"},
        {"_ws.col.Protocol": "HTTP2", "_ws.col.Info": "HEADERS[1]: 204 No Content", "ip.src": "127.0.0.10", "ip.dst": "127.0.0.13"})
    assert a["events"][0]["source_nf"] == "SCP"
    assert "999700000000001" not in str(a)
    assert a["events"][1]["target_nf"] != "UDR"
    assert a["events"][2]["status"] == "info"
    assert len(a["events"]) == 3


def test_subscriber_scope_does_not_include_other_ue_with_same_pdu_id():
    a = analyze(nas("Registration request", **{"e212.imsi": "999700000000001", "nas_5gs.pdu_session_id": "1"}),
        nas("Registration accept", True),
        nas("Registration reject", **{"ngap.RAN_UE_NGAP_ID": "9", "nas_5gs.pdu_session_id": "1"}),
        selector_hash=subscriber_hash("999700000000001"), selector_kind="imsi", procedures=["registration"])
    assert len(a["events"]) == 2
    assert a["outcome"] == "success"
    assert a["standards_review"]["conformance"] == "not-certified"


def test_unknown_or_concealed_suci_never_reconstructed():
    for scheme in ("", "1", "2"):
        a = analyze(nas("Registration request", **{"nas_5gs.mm.suci.msin": "0000000001", "nas_5gs.mm.suci.scheme_id": scheme}),
            selector_hash=subscriber_hash("999700000000001"), selector_kind="imsi")
        assert a["outcome"] == "inconclusive"
        assert not a["events"]


def test_null_suci_requires_on_wire_plmn_and_imsi_format():
    a = analyze(nas("Registration request", **{"nas_5gs.mm.suci.msin": "0000000001",
        "nas_5gs.mm.suci.scheme_id": "0", "nas_5gs.mm.suci.supi_fmt": "0", "e212.mcc": "999", "e212.mnc": "70"}),
        selector_hash=subscriber_hash("999700000000001"), selector_kind="imsi", scenario_defaults={"mcc": "999", "mnc": "70"})
    assert a["target"]["matched"]
    assert len(a["events"]) == 1


def test_no_time_based_deduplication_and_no_gtpu_direction_guess():
    row = {"_ws.col.Protocol": "HTTP2", "_ws.col.Info": "DATA[1]", "frame.time_epoch": "1.0"}
    a = analyze(row, row, {"_ws.col.Protocol": "GTP", "ip.src": "10.210.50.8", "ip.dst": "10.210.50.10", "gtp.teid": "0x01", "_ws.col.Info": "Echo reply"})
    assert len(a["events"]) == 3
    assert (a["events"][2]["source_nf"], a["events"][2]["target_nf"]) == ("UPF", "gNB")


def test_timer_reference_is_not_runtime_validation():
    a = analyze(nas("Registration request"))
    review = a["standards_review"]
    assert review["timers"] == "not-assessed"
    assert review["timer_references"]["T3510"]["nominal_seconds"] == 15
    assert all(ref["version"].startswith("16.") for ref in review["references"].values())


def test_explicit_4g_not_routed_to_new_policy():
    a = analyze({"_ws.col.Protocol": "S1AP", "_ws.col.Info": "InitialUEMessage"}, scenario_id="4g-epc")
    assert "analysis_policy" not in a

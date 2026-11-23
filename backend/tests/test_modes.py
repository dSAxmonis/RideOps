import pytest

from app.domain.models import PrecheckMode
from app.services.precheck import is_escalation_gated
from tests.conftest import EXPORT, HEADERS, ROSTER, all_evidence, make_client


def decide(client, ticket_id, **body):
    payload = {"agent": "Agent Test", "action": "escalated", **body}
    return client.post(f"/api/v1/tickets/{ticket_id}/decisions", headers=HEADERS, json=payload)


def precheck(client, ticket_id, evidence):
    return client.post(
        f"/api/v1/tickets/{ticket_id}/precheck", headers=HEADERS, json={"evidence": evidence}
    ).json()


@pytest.mark.parametrize(
    ("priority", "missing", "mode", "gated"),
    [
        ("P2", ["logs"], PrecheckMode.ENFORCE, True),
        ("P2", ["logs"], PrecheckMode.MONITOR, False),
        ("P1", ["logs"], PrecheckMode.ENFORCE, False),
        ("P2", [], PrecheckMode.ENFORCE, False),
        ("P2", None, PrecheckMode.ENFORCE, False),
    ],
)
def test_only_missing_proof_gates_and_only_in_enforce(priority, missing, mode, gated):
    assert is_escalation_gated(priority, missing, mode) is gated


def test_monitor_logs_verdict_without_gating(data_path):
    with make_client(data_path, precheck_mode="monitor") as client:
        body = precheck(client, "T-R1", {})
        assert (body["mode"], body["verdict"]) == ("monitor", "needs_info")
        assert body["escalation_gated"] is False
        response = decide(client, "T-R1")
        assert response.status_code == 201
        assert response.json()["server_verdict"] == "needs_info"


def test_enforce_gates_missing_proof_until_reason_or_proof(client):
    assert precheck(client, "T-R1", {})["escalation_gated"] is True
    assert decide(client, "T-R1").status_code == 422
    assert decide(client, "T-R1", override_reason="Client outage").status_code == 201
    assert decide(client, "T-R1", evidence=all_evidence(ROSTER)).status_code == 201


def test_filler_proof_does_not_clear_the_gate(client):
    filler = dict.fromkeys(all_evidence(ROSTER), "aaaaaaaa")
    assert precheck(client, "T-R1", filler)["escalation_gated"] is True
    assert decide(client, "T-R1", evidence=filler).status_code == 422


def test_known_issue_with_complete_proof_is_a_warning_not_a_gate(client):
    evidence = all_evidence(EXPORT)
    body = precheck(client, "T-Q1", evidence)
    assert body["verdict"] == "likely_known_issue"
    assert body["escalation_gated"] is False
    response = decide(client, "T-Q1", evidence=evidence)
    assert response.status_code == 201
    assert response.json()["server_verdict"] == "likely_known_issue"


@pytest.mark.parametrize("mode", ["monitor", "enforce"])
def test_p1_is_never_gated_in_either_mode(data_path, mode):
    with make_client(data_path, precheck_mode=mode) as client:
        assert precheck(client, "T-P1", {})["escalation_gated"] is False
        assert decide(client, "T-P1").status_code == 201


def test_replay_keeps_flags_but_delays_no_bug(client):
    body = client.get("/api/v1/metrics/backtest", headers=HEADERS).json()
    assert body["policy_version"] == "2026-11.v3"
    assert body["held_for_review"]["count"] == 0
    assert body["fixed_bugs_delayed"]["count"] == 0
    assert body["advisory_flags"]["count"] == body["history_hold_v2"]["held_for_review"]["count"]
    assert body["history_hold_v2"]["policy_version"] == "2026-11.v2"

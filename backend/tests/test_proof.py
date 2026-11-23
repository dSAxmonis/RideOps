import pytest

from tests.conftest import EXPORT, HEADERS, ROSTER, all_evidence


def post_precheck(client, ticket_id, evidence):
    return client.post(
        f"/api/v1/tickets/{ticket_id}/precheck", headers=HEADERS, json={"evidence": evidence}
    )


def post_decision(client, ticket_id, **body):
    return client.post(
        f"/api/v1/tickets/{ticket_id}/decisions",
        headers=HEADERS,
        json={"agent": "Agent Test", "action": "escalated", **body},
    )


@pytest.mark.parametrize(
    ("proof", "done"),
    [("1234567", False), ("1 2 3 4 5 6 7", False), ("        ", False), ("12345678", True)],
)
def test_item_done_needs_eight_non_space_chars(client, proof, done):
    body = post_precheck(client, "T-R1", {"shift_date_time": proof}).json()
    item = next(i for i in body["checklist"] if i["key"] == "shift_date_time")
    assert item["done"] is done
    assert item["proof_hint"]
    assert item["proof"] == (proof.strip() or None)


@pytest.mark.parametrize("value", [True, 1, None, ["proof text"], {"a": "proof text"}])
@pytest.mark.parametrize("post", [post_precheck, None])
def test_non_string_proof_rejected(client, value, post):
    evidence = {"shift_date_time": value}
    response = (
        post(client, "T-R1", evidence)
        if post
        else post_decision(client, "T-R1", evidence=evidence, override_reason="Reason given")
    )
    assert response.status_code == 422


def test_proof_length_is_capped(client):
    assert post_precheck(client, "T-R1", {"shift_date_time": "x" * 300}).status_code == 200
    assert post_precheck(client, "T-R1", {"shift_date_time": "x" * 301}).status_code == 422


def test_weak_proof_cannot_satisfy_override(client):
    weak = dict.fromkeys(all_evidence(ROSTER), "ok")
    assert post_decision(client, "T-R1", evidence=weak).status_code == 422


def test_decision_stores_proof(client):
    evidence = all_evidence(ROSTER)
    response = post_decision(client, "T-R1", evidence=evidence)
    assert response.status_code == 201
    body = response.json()
    assert body["server_verdict"] == "ready_to_escalate"
    assert body["evidence"] == evidence


@pytest.mark.parametrize("evidence", [None, {}, {"stale_key": "stale proof text"}])
def test_p1_decision_succeeds_with_any_string_evidence(client, evidence):
    response = post_decision(client, "T-P1", evidence=evidence)
    assert response.status_code == 201
    assert response.json()["evidence"] == {}


def test_null_evidence_precheck_works(client):
    response = client.post(
        "/api/v1/tickets/T-P1/precheck", headers=HEADERS, json={"evidence": None}
    )
    assert response.status_code == 200
    assert response.json()["verdict"] == "ready_to_escalate"
    assert len(response.json()["checklist"]) == len(all_evidence(EXPORT))

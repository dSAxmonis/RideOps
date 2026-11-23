import json

import pytest

from tests.conftest import (
    CONFIG,
    DUPLICATE,
    FIXED,
    HEADERS,
    ROSTER,
    all_evidence,
    escalated,
    make_client,
    row,
    write_csv,
)

BURNDOWN = "/api/v1/backlog/burndown"
LIVE = "/api/v1/metrics/live"
INSUFFICIENT = "Insufficient info - returned to L1"
HOW_TO = "Not a bug - how-to"
NOT_REPRO = "Not reproducible"
EXPECTED_LANES = {
    "T-A1": "confirm_fix",
    "T-A2": "apply_config",
    "T-A3": "get_info",
    "T-A4": "link_known_issue",
    "T-A5": "send_howto",
    "T-A6": "verify_with_client",
    "T-A7": "l1_triage",
}


def backlog_rows():
    outcomes = [FIXED, CONFIG, INSUFFICIENT, DUPLICATE, HOW_TO, NOT_REPRO]
    rows = [
        escalated(
            f"T-A{index}",
            f"2026-09-{index + 10} 09:00",
            "",
            outcome,
            status="Open - with Engineering" if index == 1 else "Open - with L1",
            priority="P3",
            text=f"open issue number {index}",
        )
        for index, outcome in enumerate(outcomes, start=1)
    ]
    rows.append(row("T-A7", "2026-09-05 09:00", status="Open - with L1", priority="P1"))
    rows.append(
        row(
            "T-DONE",
            "2026-09-01 09:00",
            first_closed_at="2026-09-02 09:00",
            final_closed_at="2026-09-02 09:00",
        )
    )
    return rows


@pytest.fixture
def backlog_client(tmp_path):
    with make_client(write_csv(tmp_path / "backlog.csv", backlog_rows())) as client:
        yield client


def act(client, ticket_id, action, **extra):
    return client.post(
        f"/api/v1/backlog/{ticket_id}/actions",
        headers=HEADERS,
        json={"action": action, "agent": "Agent Test", **extra},
    )


def test_burndown_lanes_order_and_mismatch(backlog_client):
    body = backlog_client.get(BURNDOWN, headers=HEADERS).json()
    assert body["open_at_snapshot"] == body["open_now"] == 7
    assert body["cleared"] == 0
    assert sum(lane["count"] for lane in body["lanes"]) == 7
    assert {item["ticket_id"]: item["lane"] for item in body["items"]} == EXPECTED_LANES
    assert body["items"][0]["ticket_id"] == "T-A7"
    assert [item["ticket_id"] for item in body["items"][1:3]] == ["T-A1", "T-A2"]
    flagged = [item["ticket_id"] for item in body["items"] if item["status_mismatch"]]
    assert flagged == ["T-A1"]
    assert {item["owner"] for item in body["items"]} == {"L1"}
    assert body["items"][1]["eng_outcome"] == FIXED
    assert body["items"][1]["state"] == "open"
    assert body["items"][1]["last_action_at"] is None


def test_clear_then_reopen_is_append_only(backlog_client):
    cleared = act(backlog_client, "T-A1", "cleared", note="Client confirmed")
    assert cleared.status_code == 201
    assert cleared.json()["state"] == "cleared"
    assert cleared.json()["last_action_at"]
    body = backlog_client.get(BURNDOWN, headers=HEADERS).json()
    assert (body["open_now"], body["cleared"]) == (6, 1)
    assert sum(lane["count"] for lane in body["lanes"]) == 6
    assert len(body["items"]) == 7

    assert act(backlog_client, "T-A1", "reopened").json()["state"] == "reopened"
    body = backlog_client.get(BURNDOWN, headers=HEADERS).json()
    assert (body["open_now"], body["cleared"]) == (7, 0)

    assert act(backlog_client, "T-A2", "waiting_client").json()["state"] == "waiting_client"
    assert backlog_client.get(BURNDOWN, headers=HEADERS).json()["open_now"] == 7


def test_action_validation(backlog_client):
    assert act(backlog_client, "T-DONE", "cleared").status_code == 404
    assert act(backlog_client, "NOPE", "cleared").status_code == 404
    assert act(backlog_client, "T-A1", "closed").status_code == 422
    assert act(backlog_client, "T-A1", "cleared", note="x" * 2001).status_code == 422
    assert act(backlog_client, "T-A1", "cleared", agent="   ").status_code == 422


def test_burndown_does_not_change_ticket_hiding(backlog_client):
    assert backlog_client.get(BURNDOWN, headers=HEADERS).status_code == 200
    ticket = backlog_client.get("/api/v1/tickets/T-A1", headers=HEADERS).json()
    assert ticket["eng_outcome"] is None
    assert ticket["eng_handoffs"] is None


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", BURNDOWN), ("post", "/api/v1/backlog/T-A1/actions"), ("get", LIVE)],
)
def test_new_routes_require_auth(backlog_client, method, path):
    assert backlog_client.request(method, path).status_code == 401


def test_live_metrics_counts_activity(tmp_path):
    rows = [
        *backlog_rows(),
        *[
            escalated(
                f"T-K{index}",
                f"2026-07-{index + 10} 09:00",
                f"2026-07-{index + 10} 18:00",
                DUPLICATE,
                category=ROSTER,
                text="repeat sample failure",
            )
            for index in range(10)
        ],
        row(
            "T-HOLD",
            "2026-08-20 09:00",
            text="repeat sample failure",
            first_closed_at="2026-08-20 12:00",
            final_closed_at="2026-08-20 12:00",
        ),
    ]
    with make_client(write_csv(tmp_path / "live.csv", rows)) as client:
        empty = client.get(LIVE, headers=HEADERS).json()
        assert empty["decisions_total"] == 0
        assert empty["override_rate"] == 0.0
        assert empty["by_day"] == []
        assert (empty["storage"], empty["durable"]) == ("sqlite", False)

        def decide(action, **extra):
            response = client.post(
                "/api/v1/tickets/T-HOLD/decisions",
                headers=HEADERS,
                json={"action": action, "agent": "Agent Test", **extra},
            )
            assert response.status_code == 201

        decide("resolved_at_l1")
        decide("requested_info")
        decide("escalated", override_reason="Different symptom")
        assert act(client, "T-A1", "cleared").status_code == 201
        assert act(client, "T-A2", "cleared").status_code == 201
        assert act(client, "T-A2", "reopened").status_code == 201
        body = client.get(LIVE, headers=HEADERS).json()

    assert body["decisions_total"] == 3
    assert body["by_action"] == {"escalated": 1, "resolved_at_l1": 1, "requested_info": 1}
    assert body["overrides"] == 1
    assert body["override_rate"] == 0.3333
    assert body["escalations_avoided"] == 2
    assert (body["open_at_snapshot"], body["open_now"], body["cleared"]) == (7, 6, 1)
    assert body["by_lane_cleared"]["confirm_fix"] == 1
    assert body["by_lane_cleared"]["apply_config"] == 0
    assert sum(day["decisions"] for day in body["by_day"]) == 3
    assert sum(day["cleared"] for day in body["by_day"]) == 1


def test_ready_decision_is_not_counted_as_avoided(data_path):
    with make_client(data_path) as client:
        response = client.post(
            "/api/v1/tickets/T-R1/decisions",
            headers=HEADERS,
            json={
                "action": "resolved_at_l1",
                "agent": "Agent Test",
                "evidence": all_evidence(ROSTER),
            },
        )
        assert response.status_code == 201
        body = client.get(LIVE, headers=HEADERS).json()
    assert body["escalations_avoided"] == 0


def test_burndown_masks_names(tmp_path):
    rows = backlog_rows()
    for item in rows:
        item.update(client_name="Hidden Sample Corp", assigned_agent="Taylor Fictional")
    with make_client(write_csv(tmp_path / "m.csv", rows), mask_names=True) as client:
        action = act(client, "T-A1", "cleared", agent="Taylor Fictional", note="Hidden Sample Corp")
        burndown = client.get(BURNDOWN, headers=HEADERS)
        live = client.get(LIVE, headers=HEADERS)
    payload = json.dumps([action.json(), burndown.json(), live.json()]).casefold()
    assert "hidden sample corp" not in payload
    assert "taylor fictional" not in payload

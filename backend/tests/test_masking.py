import json

from app.services.ingest import load_tickets
from app.services.masking import NameMasker
from tests.conftest import (
    DUPLICATE,
    EXPORT,
    HEADERS,
    escalated,
    make_client,
    row,
    write_csv,
)

CLIENT_A = "Zenith Sample Works"
CLIENT_B = "Orbit Placeholder Ltd"
AGENT_A = "Robin Invented"
AGENT_B = "Casey Madeup"
REAL_NAMES = (CLIENT_A, CLIENT_B, AGENT_A, AGENT_B)
TEXT = "sample export button times out"


def masked_rows():
    rows = [
        escalated(
            f"T-D{index}",
            f"2026-08-0{index + 1} 09:00",
            f"2026-08-0{index + 1} 18:00",
            DUPLICATE,
            category=EXPORT,
            text=TEXT,
            client_id="CL-007",
            client_name=CLIENT_A,
            assigned_agent=AGENT_B,
        )
        for index in range(4)
    ]
    rows.append(
        row(
            "T-M1",
            "2026-09-20 09:00",
            category=EXPORT,
            text=TEXT,
            status="Open - with L1",
            client_id="CL-042",
            client_name=CLIENT_B,
            assigned_agent=AGENT_A,
        )
    )
    return rows


def test_aliases_are_deterministic(tmp_path):
    rows = masked_rows()
    first = NameMasker.from_tickets(load_tickets(write_csv(tmp_path / "a.csv", rows)))
    second = NameMasker.from_tickets(load_tickets(write_csv(tmp_path / "b.csv", rows[::-1])))
    tickets = load_tickets(write_csv(tmp_path / "c.csv", rows))
    assert [first.apply(t) for t in tickets] == [second.apply(t) for t in tickets]
    by_id = {t.ticket_id: first.apply(t) for t in tickets}
    assert by_id["T-M1"].client_name == "Client 042"
    assert by_id["T-D0"].client_name == "Client 007"
    assert by_id["T-D0"].assigned_agent == "Agent A"
    assert by_id["T-M1"].assigned_agent == "Agent B"


def test_masking_is_off_by_default(tmp_path):
    path = write_csv(tmp_path / "off.csv", masked_rows())
    with make_client(path) as client:
        body = client.get("/api/v1/tickets/T-M1", headers=HEADERS).json()
    assert body["client_name"] == CLIENT_B


def test_no_real_names_in_any_response_when_masked(tmp_path):
    path = write_csv(tmp_path / "on.csv", masked_rows())
    with make_client(path, mask_names=True) as client:
        responses = [
            client.get("/api/v1/tickets?limit=200", headers=HEADERS),
            client.get("/api/v1/tickets/T-M1", headers=HEADERS),
            client.get("/api/v1/known-issues", headers=HEADERS),
            client.get("/api/v1/metrics/weekly", headers=HEADERS),
            client.get("/api/v1/metrics/backtest", headers=HEADERS),
            client.post(
                "/api/v1/tickets/T-M1/precheck",
                headers=HEADERS,
                json={"evidence": {"date_range": f"checked with {CLIENT_B} today"}},
            ),
            client.post(
                "/api/v1/tickets/T-M1/decisions",
                headers=HEADERS,
                json={
                    "action": "escalated",
                    "agent": AGENT_A,
                    "override_reason": f"Requested by {CLIENT_B}",
                    "evidence": {"date_range": f"checked with {AGENT_B} today"},
                },
            ),
        ]
        assert all(response.status_code < 300 for response in responses)
        payload = json.dumps([response.json() for response in responses]).casefold()
        filtered = client.get("/api/v1/tickets", params={"q": CLIENT_B}, headers=HEADERS).json()
    for name in REAL_NAMES:
        assert name.casefold() not in payload
    assert "client 042" in payload
    assert filtered["total"] == 0

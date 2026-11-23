from app.domain.checklists import CHECKLISTS
from app.domain.models import TriageView
from app.domain.playbooks import PLAYBOOKS
from app.services.ingest import load_tickets
from app.services.precheck import run_precheck
from app.services.retrieval import KnowledgeBase
from tests.conftest import DUPLICATE, EXPORT, FIXED, HEADERS, escalated, make_client, row, write_csv

TEXT = "sample export button times out"


def duplicates(prefix, days, text=TEXT):
    return [
        escalated(
            f"{prefix}{day}",
            f"2026-08-{day:02d} 09:00",
            f"2026-08-{day:02d} 18:00",
            DUPLICATE,
            category=EXPORT,
            text=text,
        )
        for day in days
    ]


def query(ticket_id, created, text=TEXT):
    return row(
        ticket_id,
        created,
        category=EXPORT,
        text=text,
        first_closed_at="2026-09-29 09:00",
        final_closed_at="2026-09-29 09:00",
    )


def result_for(tickets, ticket_id):
    ticket = next(t for t in tickets if t.ticket_id == ticket_id)
    return run_precheck(TriageView.from_ticket(ticket), {}, KnowledgeBase(tickets))


def test_known_issue_is_time_safe(tmp_path):
    rows = [
        *duplicates("T-D", [1, 2, 3, 4]),
        query("T-BEFORE", "2026-08-03 18:00"),
        query("T-AFTER", "2026-08-03 18:01"),
        query("T-LATER", "2026-08-05 09:00"),
    ]
    tickets = load_tickets(write_csv(tmp_path / "ki.csv", rows))
    assert result_for(tickets, "T-BEFORE").known_issue is None
    after = result_for(tickets, "T-AFTER").known_issue
    assert (after.id, after.duplicate_count) == ("KI-001", 3)
    assert str(after.last_seen) == "2026-08-03 18:00:00"
    assert result_for(tickets, "T-LATER").known_issue.duplicate_count == 4


def test_ids_are_stable_when_later_issues_appear(tmp_path):
    first = duplicates("T-A", [1, 2, 3], text="first repeated failure text")
    second = duplicates("T-B", [10, 11, 12], text="second repeated failure text")
    only_first = KnowledgeBase(load_tickets(write_csv(tmp_path / "a.csv", first)))
    both = KnowledgeBase(load_tickets(write_csv(tmp_path / "b.csv", second + first)))
    assert only_first.known_issues.items()[0].id == "KI-001"
    ids = {item.title: item.id for item in both.known_issues.items()}
    assert ids == {
        "first repeated failure text": "KI-001",
        "second repeated failure text": "KI-002",
    }


def test_two_duplicates_or_other_outcomes_do_not_qualify(tmp_path):
    rows = duplicates("T-D", [1, 2])
    rows.append(
        escalated("T-F", "2026-08-03 09:00", "2026-08-03 18:00", FIXED, category=EXPORT, text=TEXT)
    )
    knowledge = KnowledgeBase(load_tickets(write_csv(tmp_path / "few.csv", rows)))
    assert knowledge.known_issues.items() == []


def test_known_issue_does_not_change_verdict(tmp_path):
    rows = [*duplicates("T-D", [1, 2, 3]), query("T-Q", "2026-08-10 09:00")]
    tickets = load_tickets(write_csv(tmp_path / "v.csv", rows))
    assert result_for(tickets, "T-Q").verdict == "needs_info"


def test_known_issues_endpoint_and_precheck_fields(client):
    items = client.get("/api/v1/known-issues", headers=HEADERS).json()["items"]
    assert [item["id"] for item in items] == ["KI-001"]
    assert items[0]["category"] == EXPORT
    assert items[0]["duplicate_count"] == 10
    body = client.post(
        "/api/v1/tickets/T-Q1/precheck", headers=HEADERS, json={"evidence": {}}
    ).json()
    assert body["known_issue"]["id"] == "KI-001"
    assert "category" not in body["known_issue"]
    assert body["playbook"]["draft"] is True
    assert body["playbook"]["steps"]
    clean = client.post(
        "/api/v1/tickets/T-R1/precheck", headers=HEADERS, json={"evidence": {}}
    ).json()
    assert clean["known_issue"] is None


def test_known_issues_requires_auth(data_path):
    with make_client(data_path) as test_client:
        assert test_client.get("/api/v1/known-issues").status_code == 401


def test_every_category_has_a_draft_playbook():
    assert set(PLAYBOOKS) == set(CHECKLISTS)
    for playbook in PLAYBOOKS.values():
        assert playbook.draft is True
        assert playbook.title
        assert len(playbook.steps) >= 3

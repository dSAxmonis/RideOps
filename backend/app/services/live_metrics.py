"""Activity counts from recorded decisions and backlog actions. These are not outcome claims."""

from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timedelta, timezone
from typing import Protocol

from app.domain.models import DecisionAction, TicketRecord, Verdict
from app.services.burndown import LANES, STATE_CLEARED, LatestAction, as_utc, lane_for

IST = timezone(timedelta(hours=5, minutes=30))


class DecisionActivity(Protocol):
    action: str
    server_verdict: str
    override_reason: str | None
    created_at: datetime


def _day(moment: datetime) -> str:
    return as_utc(moment).astimezone(IST).date().isoformat()


def build_live_metrics(
    tickets: Sequence[TicketRecord],
    latest: Mapping[str, LatestAction],
    decisions: Iterable[DecisionActivity],
    storage: str,
) -> dict[str, object]:
    backlog = [ticket for ticket in tickets if ticket.is_open]
    cleared_tickets = [
        ticket
        for ticket in backlog
        if ticket.ticket_id in latest and latest[ticket.ticket_id].action == STATE_CLEARED
    ]
    rows = list(decisions)
    by_action = Counter(row.action for row in rows)
    held = [row for row in rows if row.server_verdict != Verdict.READY_TO_ESCALATE.value]
    escalated_held = [row for row in held if row.action == DecisionAction.ESCALATED.value]
    overrides = sum(bool(row.override_reason) for row in escalated_held)
    lane_counts = Counter(lane_for(ticket) for ticket in cleared_tickets)
    decisions_by_day = Counter(_day(row.created_at) for row in rows)
    cleared_by_day = Counter(
        _day(latest[ticket.ticket_id].created_at) for ticket in cleared_tickets
    )

    return {
        "open_at_snapshot": len(backlog),
        "open_now": len(backlog) - len(cleared_tickets),
        "cleared": len(cleared_tickets),
        "decisions_total": len(rows),
        "by_action": {action.value: by_action[action.value] for action in DecisionAction},
        "overrides": overrides,
        "override_rate": round(overrides / len(held), 4) if held else 0.0,
        "escalations_avoided": len(held) - len(escalated_held),
        "by_lane_cleared": {lane.lane: lane_counts[lane.lane] for lane in LANES},
        "by_day": [
            {
                "day": day,
                "decisions": decisions_by_day[day],
                "cleared": cleared_by_day[day],
            }
            for day in sorted(set(decisions_by_day) | set(cleared_by_day))
        ],
        "storage": storage,
        "durable": storage == "postgres",
    }

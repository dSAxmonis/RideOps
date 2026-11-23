"""Work queue for tickets open at the snapshot. The source data is never modified."""

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from app.config import SNAPSHOT_AT
from app.domain.models import (
    OUTCOME_CONFIG,
    OUTCOME_DUPLICATE,
    OUTCOME_FIXED,
    OUTCOME_HOW_TO,
    OUTCOME_INSUFFICIENT,
    OUTCOME_NOT_REPRODUCIBLE,
    TicketRecord,
)

STATE_OPEN = "open"
STATE_CLEARED = "cleared"
OWNER_L1 = "L1"
OWNER_ENGINEERING = "Engineering"
PRIORITY_ORDER = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}


@dataclass(frozen=True, slots=True)
class Lane:
    lane: str
    label: str
    next_action: str


LANES = (
    Lane("confirm_fix", "Confirm fix", "Confirm the fix with the client, then clear."),
    Lane("apply_config", "Apply config", "Apply or guide the config change, then confirm."),
    Lane("get_info", "Get info", "Collect the missing details from the client."),
    Lane("link_known_issue", "Link known issue", "Link the known issue and update the client."),
    Lane("send_howto", "Send how-to", "Send the how-to guidance and confirm it worked."),
    Lane("verify_with_client", "Verify with client", "Check whether the client still sees it."),
    Lane("l1_triage", "L1 triage", "Triage at L1 and run the pre-escalation check."),
)
LANE_BY_ID = {lane.lane: lane for lane in LANES}
OUTCOME_LANES = {
    OUTCOME_FIXED: "confirm_fix",
    OUTCOME_CONFIG: "apply_config",
    OUTCOME_INSUFFICIENT: "get_info",
    OUTCOME_DUPLICATE: "link_known_issue",
    OUTCOME_HOW_TO: "send_howto",
    OUTCOME_NOT_REPRODUCIBLE: "verify_with_client",
}
AWAITING_VERDICT = "Follow up with Engineering for a verdict."


class LatestAction(Protocol):
    action: str
    created_at: datetime


def lane_for(ticket: TicketRecord) -> str:
    return OUTCOME_LANES.get(ticket.eng_outcome or "", "l1_triage")


def state_for(ticket_id: str, latest: Mapping[str, LatestAction]) -> str:
    action = latest.get(ticket_id)
    return action.action if action else STATE_OPEN


def as_utc(moment: datetime) -> datetime:
    return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment


def build_item(ticket: TicketRecord, action: LatestAction | None) -> dict[str, object]:
    lane = LANE_BY_ID[lane_for(ticket)]
    awaiting = ticket.escalated_to_eng and not ticket.eng_outcome
    return {
        "ticket_id": ticket.ticket_id,
        "priority": ticket.priority,
        "client_name": ticket.client_name,
        "category": ticket.category,
        "description": ticket.description,
        "assigned_agent": ticket.assigned_agent,
        "status": ticket.status,
        "eng_outcome": ticket.eng_outcome,
        "age_hours": round((SNAPSHOT_AT - ticket.created_at).total_seconds() / 3600, 1),
        "handoffs": ticket.eng_handoffs,
        "reopen_count": ticket.reopen_count,
        "lane": lane.lane,
        "owner": OWNER_ENGINEERING if awaiting else OWNER_L1,
        "next_action": AWAITING_VERDICT if awaiting else lane.next_action,
        "status_mismatch": "Engineering" in ticket.status and bool(ticket.eng_outcome),
        "state": action.action if action else STATE_OPEN,
        "last_action_at": as_utc(action.created_at) if action else None,
    }


def open_at_snapshot(tickets: Sequence[TicketRecord]) -> list[TicketRecord]:
    return sorted(
        (ticket for ticket in tickets if ticket.is_open),
        key=lambda t: (PRIORITY_ORDER.get(t.priority, 9), t.created_at, t.ticket_id),
    )


def build_burndown(
    tickets: Sequence[TicketRecord], latest: Mapping[str, LatestAction]
) -> dict[str, object]:
    backlog = open_at_snapshot(tickets)
    items = [build_item(ticket, latest.get(ticket.ticket_id)) for ticket in backlog]
    remaining = Counter(item["lane"] for item in items if item["state"] != STATE_CLEARED)
    cleared = sum(item["state"] == STATE_CLEARED for item in items)
    return {
        "snapshot_at": SNAPSHOT_AT,
        "open_at_snapshot": len(items),
        "open_now": len(items) - cleared,
        "cleared": cleared,
        "lanes": [
            {
                "lane": lane.lane,
                "label": lane.label,
                "count": remaining[lane.lane],
                "owner": OWNER_L1,
                "next_action": lane.next_action,
            }
            for lane in LANES
        ],
        "items": items,
    }

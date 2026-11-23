from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.domain.checklists import MAX_PROOF_CHARS
from app.domain.models import ConfidenceBand, DecisionAction, Verdict

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
ProofText = Annotated[str, StringConstraints(strict=True, max_length=MAX_PROOF_CHARS)]


class TicketSummary(BaseModel):
    ticket_id: str
    created_at: datetime
    channel: str
    client_name: str
    client_tier: str
    category: str
    priority: str
    description: str
    assigned_agent: str
    status: str
    escalated_to_eng: bool


class TicketList(BaseModel):
    items: list[TicketSummary]
    total: int


class Ticket(TicketSummary):
    client_id: str
    first_response_at: datetime | None = None
    eng_ticket_id: str | None = None
    eng_handoffs: int | None = None
    eng_outcome: str | None = None
    first_closed_at: datetime | None = None
    final_closed_at: datetime | None = None
    reopen_count: int | None = None
    csat_score: float | None = None


class PrecheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence: dict[str, ProofText] | None = None
    note: LongText | None = None


class ChecklistEntry(BaseModel):
    key: str
    label: str
    required: bool
    done: bool
    proof: str | None
    proof_hint: str


class SimilarTicket(BaseModel):
    ticket_id: str
    description: str
    category: str
    eng_outcome: str
    similarity: float
    closed_at: datetime


class KnownIssueRef(BaseModel):
    id: str
    title: str
    duplicate_count: int
    last_seen: datetime


class KnownIssueItem(KnownIssueRef):
    category: str


class KnownIssueList(BaseModel):
    items: list[KnownIssueItem]


class PlaybookView(BaseModel):
    title: str
    steps: list[str]
    draft: Literal[True] = True


class PrecheckResponse(BaseModel):
    ticket_id: str
    verdict: Verdict
    confidence_band: ConfidenceBand
    reasons: list[str]
    checklist: list[ChecklistEntry]
    similar: list[SimilarTicket]
    suggested_action: str
    known_issue: KnownIssueRef | None
    playbook: PlaybookView
    override_allowed: Literal[True] = True


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: DecisionAction
    verdict_shown: Verdict | None = None
    evidence: dict[str, ProofText] | None = None
    override_reason: LongText | None = None
    agent: ShortText


class DecisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: str
    action: DecisionAction
    verdict_shown: Verdict | None
    server_verdict: Verdict
    override_reason: str | None
    evidence: dict[str, str]
    agent: str
    created_at: datetime


class BacklogActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["cleared", "waiting_client", "reopened"]
    agent: ShortText
    note: LongText | None = None


class BurndownLane(BaseModel):
    lane: str
    label: str
    count: int
    owner: str
    next_action: str


class BurndownItem(BaseModel):
    ticket_id: str
    priority: str
    client_name: str
    category: str
    description: str
    assigned_agent: str
    status: str
    eng_outcome: str | None
    age_hours: float
    handoffs: int
    reopen_count: int
    lane: str
    owner: str
    next_action: str
    status_mismatch: bool
    state: str
    last_action_at: datetime | None


class BurndownResponse(BaseModel):
    snapshot_at: datetime
    open_at_snapshot: int
    open_now: int
    cleared: int
    lanes: list[BurndownLane]
    items: list[BurndownItem]


class LiveDay(BaseModel):
    day: str
    decisions: int
    cleared: int


class LiveMetrics(BaseModel):
    open_at_snapshot: int
    open_now: int
    cleared: int
    decisions_total: int
    by_action: dict[str, int]
    overrides: int
    override_rate: float
    escalations_avoided: int
    by_lane_cleared: dict[str, int]
    by_day: list[LiveDay]
    storage: Literal["postgres", "sqlite"]
    durable: bool


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"

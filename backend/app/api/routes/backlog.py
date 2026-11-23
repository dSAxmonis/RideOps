from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import AppState, get_state
from app.auth import require_access_code
from app.domain.schemas import BacklogActionRequest, BurndownItem, BurndownResponse
from app.services.burndown import build_burndown, build_item

router = APIRouter(prefix="/backlog", tags=["backlog"], dependencies=[Depends(require_access_code)])


@router.get("/burndown", response_model=BurndownResponse)
def burndown(state: AppState = Depends(get_state)) -> BurndownResponse:
    tickets = state.data.tickets.all
    return BurndownResponse(**build_burndown(tickets, state.backlog.latest()))


@router.post(
    "/{ticket_id}/actions",
    response_model=BurndownItem,
    status_code=status.HTTP_201_CREATED,
)
def record_action(
    ticket_id: str,
    body: BacklogActionRequest,
    state: AppState = Depends(get_state),
) -> BurndownItem:
    data = state.data
    ticket = data.tickets.get(ticket_id)
    if ticket is None or not ticket.is_open:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket was not open at the snapshot")
    row = state.backlog.add(
        ticket_id=ticket.ticket_id,
        action=body.action,
        agent=data.scrub(body.agent),
        note=data.scrub(body.note) or None,
    )
    return BurndownItem(**build_item(ticket, row))

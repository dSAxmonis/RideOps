from fastapi import APIRouter, Depends

from app.api.deps import AppState, get_state
from app.auth import require_access_code
from app.domain.schemas import KnownIssueItem, KnownIssueList

router = APIRouter(
    prefix="/known-issues", tags=["known-issues"], dependencies=[Depends(require_access_code)]
)


@router.get("", response_model=KnownIssueList)
def list_known_issues(state: AppState = Depends(get_state)) -> KnownIssueList:
    items = state.data.knowledge.known_issues.items()
    return KnownIssueList(
        items=[
            KnownIssueItem(
                id=item.id,
                title=item.title,
                category=item.category,
                duplicate_count=item.duplicate_count,
                last_seen=item.last_seen,
            )
            for item in items
        ]
    )

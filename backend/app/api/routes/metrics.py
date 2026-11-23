from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import AppState, get_state
from app.auth import require_access_code
from app.domain.schemas import LiveMetrics
from app.services.live_metrics import build_live_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"], dependencies=[Depends(require_access_code)])


@router.get("/weekly")
def weekly(state: AppState = Depends(get_state)) -> dict[str, Any]:
    return state.weekly()


@router.get("/backtest")
def backtest(state: AppState = Depends(get_state)) -> dict[str, Any]:
    return state.backtest()


@router.get("/live", response_model=LiveMetrics)
def live(state: AppState = Depends(get_state)) -> LiveMetrics:
    return LiveMetrics(
        **build_live_metrics(
            state.data.tickets.all,
            state.backlog.latest(),
            state.decisions.all(),
            state.decisions.storage,
        )
    )

from dataclasses import dataclass
from threading import Lock

from fastapi import Request

from app.config import Settings
from app.repositories.decisions import DecisionRepository
from app.repositories.tickets import TicketRepository
from app.services.backtest import run_backtest
from app.services.ingest import load_tickets
from app.services.metrics import weekly_metrics
from app.services.retrieval import KnowledgeBase


@dataclass(slots=True)
class DataContext:
    tickets: TicketRepository
    knowledge: KnowledgeBase


class AppState:
    """Loads ticket data on first use and caches derived reports."""

    def __init__(self, settings: Settings, decisions: DecisionRepository) -> None:
        self.settings = settings
        self.decisions = decisions
        self._data: DataContext | None = None
        self._weekly: dict[str, object] | None = None
        self._backtest: dict[str, object] | None = None
        self._lock = Lock()
        self._report_lock = Lock()

    @property
    def data(self) -> DataContext:
        with self._lock:
            if self._data is None:
                records = load_tickets(self.settings.data_path)
                self._data = DataContext(TicketRepository(records), KnowledgeBase(records))
            return self._data

    def weekly(self) -> dict[str, object]:
        data = self.data
        with self._report_lock:
            if self._weekly is None:
                self._weekly = weekly_metrics(data.tickets.all)
            return self._weekly

    def backtest(self) -> dict[str, object]:
        data = self.data
        with self._report_lock:
            if self._backtest is None:
                self._backtest = run_backtest(data.tickets.all, data.knowledge)
            return self._backtest


def get_state(request: Request) -> AppState:
    return request.app.state.container

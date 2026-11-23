"""Known issues derived from repeated duplicate outcomes on the same description template."""

from bisect import bisect_left
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.domain.models import OUTCOME_DUPLICATE

MIN_DUPLICATES = 3


class ClosedEscalation(Protocol):
    description: str
    category: str
    eng_outcome: str
    closed_at: datetime


@dataclass(frozen=True, slots=True)
class KnownIssue:
    id: str
    title: str
    category: str
    duplicate_count: int
    last_seen: datetime


def _template_key(category: str, description: str) -> tuple[str, str]:
    return category, " ".join(description.casefold().split())


class KnownIssueRegistry:
    """IDs follow the time each template reached the minimum, so later data cannot renumber."""

    def __init__(self, entries: Iterable[ClosedEscalation]) -> None:
        times: dict[tuple[str, str], list[datetime]] = defaultdict(list)
        titles: dict[tuple[str, str], tuple[datetime, str]] = {}
        for entry in entries:
            if entry.eng_outcome != OUTCOME_DUPLICATE:
                continue
            key = _template_key(entry.category, entry.description)
            times[key].append(entry.closed_at)
            candidate = (entry.closed_at, entry.description)
            titles[key] = min(titles.get(key, candidate), candidate)

        qualifying = sorted(
            (key for key, closed in times.items() if len(closed) >= MIN_DUPLICATES),
            key=lambda key: (sorted(times[key])[MIN_DUPLICATES - 1], key),
        )
        self._times = {key: sorted(times[key]) for key in qualifying}
        self._ids = {key: f"KI-{index:03d}" for index, key in enumerate(qualifying, start=1)}
        self._titles = {key: titles[key][1] for key in qualifying}

    def lookup(self, category: str, description: str, before: datetime) -> KnownIssue | None:
        """Match using only duplicates closed strictly before the given time."""
        key = _template_key(category, description)
        closed = self._times.get(key)
        if closed is None:
            return None
        count = bisect_left(closed, before)
        if count < MIN_DUPLICATES:
            return None
        return KnownIssue(self._ids[key], self._titles[key], key[0], count, closed[count - 1])

    def items(self) -> list[KnownIssue]:
        return [
            KnownIssue(
                self._ids[key],
                self._titles[key],
                key[0],
                len(closed),
                closed[-1],
            )
            for key, closed in self._times.items()
        ]

"""Deterministic aliases for client and agent names."""

import re
from collections.abc import Sequence
from dataclasses import replace
from string import ascii_uppercase

from app.domain.models import TicketRecord


def _agent_label(index: int) -> str:
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = ascii_uppercase[remainder] + letters
    return f"Agent {letters}"


def _client_label(client_id: str) -> str:
    digits = re.sub(r"\D", "", client_id)
    return f"Client {digits.zfill(3)}"


class NameMasker:
    def __init__(self, clients: dict[str, str], agents: dict[str, str]) -> None:
        self._clients = clients
        self._agents = agents
        self._aliases = {
            name.casefold(): alias for name, alias in {**clients, **agents}.items() if name
        }
        names = sorted(self._aliases, key=len, reverse=True)
        self._pattern = (
            re.compile(
                r"(?<!\w)(" + "|".join(re.escape(name) for name in names) + r")(?!\w)",
                re.IGNORECASE,
            )
            if names
            else None
        )

    @classmethod
    def from_tickets(cls, tickets: Sequence[TicketRecord]) -> "NameMasker":
        clients = {ticket.client_name: _client_label(ticket.client_id) for ticket in tickets}
        agents = {
            name: _agent_label(index)
            for index, name in enumerate(sorted({ticket.assigned_agent for ticket in tickets}))
        }
        return cls(clients, agents)

    def scrub(self, text: str) -> str:
        if self._pattern is None:
            return text
        return self._pattern.sub(lambda found: self._aliases[found.group(1).casefold()], text)

    def apply(self, ticket: TicketRecord) -> TicketRecord:
        return replace(
            ticket,
            client_name=self._clients[ticket.client_name],
            assigned_agent=self._agents[ticket.assigned_agent],
            description=self.scrub(ticket.description),
        )

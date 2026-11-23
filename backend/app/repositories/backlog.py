from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String, Text, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column, sessionmaker

from app.repositories.decisions import Base


class BacklogActionRow(Base):
    """Append-only log of work on the snapshot backlog. The latest row per ticket wins."""

    __tablename__ = "backlog_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[str] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(32))
    agent: Mapped[str] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BacklogRepository:
    def __init__(self, engine: Engine) -> None:
        self._sessions = sessionmaker(engine, expire_on_commit=False)

    def add(self, *, ticket_id: str, action: str, agent: str, note: str | None) -> BacklogActionRow:
        row = BacklogActionRow(
            ticket_id=ticket_id,
            action=action,
            agent=agent,
            note=note,
            created_at=datetime.now(UTC),
        )
        with self._sessions.begin() as session:
            session.add(row)
        return row

    def latest(self) -> dict[str, BacklogActionRow]:
        newest = select(func.max(BacklogActionRow.id)).group_by(BacklogActionRow.ticket_id)
        with self._sessions() as session:
            rows = session.scalars(select(BacklogActionRow).where(BacklogActionRow.id.in_(newest)))
            return {row.ticket_id: row for row in rows}

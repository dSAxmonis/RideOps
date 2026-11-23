import json
from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String, Text, create_engine, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


class DecisionRow(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[str] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(32))
    verdict_shown: Mapped[str | None] = mapped_column(String(32), nullable=True)
    server_verdict: Mapped[str] = mapped_column(String(32))
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    @property
    def evidence(self) -> dict[str, str]:
        return json.loads(self.evidence_json) if self.evidence_json else {}


def build_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        options: dict[str, object] = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url or url == "sqlite://":
            options["poolclass"] = StaticPool
        return create_engine(url, **options)
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2)


class DecisionRepository:
    def __init__(self, engine: Engine) -> None:
        self._sessions = sessionmaker(engine, expire_on_commit=False)
        self._engine = engine

    @property
    def engine(self) -> Engine:
        return self._engine

    @property
    def storage(self) -> str:
        return "postgres" if self._engine.dialect.name == "postgresql" else "sqlite"

    def all(self) -> list[DecisionRow]:
        with self._sessions() as session:
            return list(session.scalars(select(DecisionRow).order_by(DecisionRow.id)))

    def create_schema(self) -> None:
        Base.metadata.create_all(self._engine)
        columns = {column["name"] for column in inspect(self._engine).get_columns("decisions")}
        if "evidence_json" not in columns:
            with self._engine.begin() as connection:
                connection.execute(text("ALTER TABLE decisions ADD COLUMN evidence_json TEXT"))

    def add(
        self,
        *,
        ticket_id: str,
        action: str,
        verdict_shown: str | None,
        server_verdict: str,
        override_reason: str | None,
        agent: str,
        evidence: dict[str, str] | None = None,
    ) -> DecisionRow:
        row = DecisionRow(
            ticket_id=ticket_id,
            action=action,
            verdict_shown=verdict_shown,
            server_verdict=server_verdict,
            override_reason=override_reason,
            evidence_json=json.dumps(evidence) if evidence else None,
            agent=agent,
            created_at=datetime.now(UTC),
        )
        with self._sessions.begin() as session:
            session.add(row)
        return row

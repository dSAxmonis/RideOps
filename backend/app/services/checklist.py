from dataclasses import dataclass

from app.domain.checklists import CHECKLISTS, MIN_PROOF_CHARS, ChecklistItem


class UnknownEvidenceKeyError(ValueError):
    def __init__(self, keys: list[str]) -> None:
        super().__init__(f"Unknown evidence keys: {', '.join(keys)}")
        self.keys = keys


@dataclass(frozen=True, slots=True)
class ChecklistState:
    key: str
    label: str
    required: bool
    done: bool
    proof: str | None
    proof_hint: str


def items_for(category: str) -> tuple[ChecklistItem, ...]:
    return CHECKLISTS[category]


def is_valid_proof(proof: str | None) -> bool:
    return proof is not None and len("".join(proof.split())) >= MIN_PROOF_CHARS


def blank_state(item: ChecklistItem) -> ChecklistState:
    return ChecklistState(item.key, item.label, item.required, False, None, item.proof_hint)


def evaluate(category: str, evidence: dict[str, str]) -> list[ChecklistState]:
    items = items_for(category)
    unknown = sorted(set(evidence) - {item.key for item in items})
    if unknown:
        raise UnknownEvidenceKeyError(unknown)
    states = []
    for item in items:
        proof = (evidence.get(item.key) or "").strip() or None
        states.append(
            ChecklistState(
                item.key,
                item.label,
                item.required,
                is_valid_proof(proof),
                proof,
                item.proof_hint,
            )
        )
    return states


def known_proofs(category: str, evidence: dict[str, str] | None) -> dict[str, str]:
    """Non-blank proofs for this category's items; stale keys are dropped."""
    keys = {item.key for item in items_for(category)}
    return {
        key: proof.strip()
        for key, proof in (evidence or {}).items()
        if key in keys and proof.strip()
    }


def missing_required(states: list[ChecklistState]) -> list[ChecklistState]:
    return [state for state in states if state.required and not state.done]

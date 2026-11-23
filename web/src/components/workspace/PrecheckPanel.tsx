"use client";

import type {
  ChecklistItem,
  KnownIssueMatch,
  Playbook,
  PrecheckResponse,
  SimilarTicket,
  Verdict,
} from "@/lib/contract";
import { MAX_PROOF_CHARS, MIN_PROOF_CHARS, formatDateTime, humanize, proofChars } from "@/lib/domain";
import { Icon, type IconName } from "@/components/Icon";

const VERDICT_COPY: Record<Verdict, { label: string; lead: string; icon: IconName; tone: string; tile: string }> = {
  likely_known_issue: {
    label: "Likely a known issue",
    lead: "Past tickets suggest this may not need engineering.",
    icon: "info",
    tone: "text-serious-text",
    tile: "bg-serious-soft",
  },
  try_l1_fix: {
    label: "Try an L1 fix first",
    lead: "An L1 fix may resolve this without engineering.",
    icon: "wrench",
    tone: "text-serious-text",
    tile: "bg-serious-soft",
  },
  needs_info: {
    label: "More information needed",
    lead: "Engineering would likely need more detail to act on this.",
    icon: "alert",
    tone: "text-serious-text",
    tile: "bg-serious-soft",
  },
  ready_to_escalate: {
    label: "Ready to escalate",
    lead: "The evidence supports sending this to engineering.",
    icon: "check",
    tone: "text-good",
    tile: "bg-good-soft",
  },
};

export const verdictLabel = (verdict: Verdict) => VERDICT_COPY[verdict].label;

export function P1FastPath() {
  return (
    <section aria-label="P1 fast path" className="card flex items-start gap-3">
      <span className="icon-tile bg-serious-soft text-accent">
        <Icon name="bolt" />
      </span>
      <span>
        <span className="card-title block">P1 fast path: escalate now</span>
        <span className="text-ink-2">Evidence is optional. This check never advises holding a P1.</span>
      </span>
    </section>
  );
}

function VerdictSummary({ data, updating }: { data: PrecheckResponse; updating: boolean }) {
  const copy = VERDICT_COPY[data.verdict];
  return (
    <section aria-label="Advice" aria-busy={updating} className="card">
      <div className="flex items-start gap-3">
        <span className={`icon-tile ${copy.tile} ${copy.tone}`}>
          <Icon name={copy.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <h2 className="card-title">{copy.label}</h2>
            <span className="rounded-md bg-raised px-2 py-0.5 text-xs text-ink-2">
              {humanize(data.confidence_band)} confidence
            </span>
            {updating ? <span role="status" className="ml-auto text-xs text-ink-2">Re-checking</span> : null}
          </div>
          <p className="text-ink-2">{copy.lead}</p>
        </div>
      </div>
      {data.suggested_action ? (
        <p className="mt-3 rounded-xl bg-raised px-3 py-2.5">
          <span className="font-medium">Next: </span>
          {data.suggested_action}
        </p>
      ) : null}
      {data.reasons.length > 0 ? (
        <details className="disclosure mt-3">
          <summary>Why this advice</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
            {data.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function proofStatus(item: ChecklistItem) {
  if (item.done) return "Done";
  const count = proofChars(item.proof);
  if (count === 0) return item.required ? "Required" : "Optional";
  if (count < MIN_PROOF_CHARS) return `${MIN_PROOF_CHARS - count} more characters`;
  return "Add real detail";
}

function Checklist({
  items,
  fastPath,
  onProofChange,
}: {
  items: ChecklistItem[];
  fastPath: boolean;
  onProofChange: (key: string, proof: string) => void;
}) {
  const done = items.filter((item) => item.done).length;
  return (
    <section aria-label="Evidence checklist" className="card">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="card-title">Evidence{fastPath ? " (optional)" : ""}</h3>
        <span className="text-[13px] text-ink-2 tabular-nums">{done} of {items.length} done</span>
      </div>
      {items.length === 0 ? <p className="mt-2 text-ink-2">No evidence needed for this ticket.</p> : null}
      <ul className="mt-3 space-y-3">
        {items.map((item) => {
          const inputId = `proof-${item.key}`;
          const hintId = `${inputId}-hint`;
          return (
            <li key={item.key}>
              <div className="flex items-center gap-1.5">
                <span className={item.done ? "text-good" : "text-ink-3"}>
                  {item.done ? <Icon name="check" /> : <span aria-hidden="true" className="block h-4 w-4 rounded-full border border-current" />}
                </span>
                <label htmlFor={inputId} className="min-w-0 flex-1 font-medium">
                  {item.label}
                </label>
                <span className={`shrink-0 text-xs ${item.done ? "text-good" : "text-ink-2"}`}>
                  {fastPath && !item.done && proofChars(item.proof) === 0 ? "Optional" : proofStatus(item)}
                </span>
              </div>
              <input
                id={inputId}
                value={item.proof}
                maxLength={MAX_PROOF_CHARS}
                onChange={(event) => onProofChange(item.key, event.target.value)}
                placeholder={item.proof_hint || "Short proof"}
                aria-describedby={item.proof_hint ? hintId : undefined}
                autoComplete="off"
                className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 placeholder:text-ink-3"
              />
              {item.proof_hint ? <span id={hintId} className="sr-only">{item.proof_hint}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function KnownIssue({ issue, fastPath }: { issue: KnownIssueMatch; fastPath: boolean }) {
  return (
    <section aria-label="Known issue" className="flex items-start gap-2.5 rounded-[18px] bg-serious-soft px-4 py-3">
      <Icon name="info" className="mt-0.5 text-serious" />
      <div className="min-w-0">
        <p className="font-medium">{issue.title}</p>
        <p className="text-[13px] text-ink-2">
          Known issue · {issue.duplicate_count} past duplicates · last seen {formatDateTime(issue.last_seen)}
          {fastPath ? " · context only, do not delay this P1" : ""}
        </p>
      </div>
    </section>
  );
}

function PlaybookSteps({ playbook, fastPath }: { playbook: Playbook; fastPath: boolean }) {
  return (
    <details className="disclosure card">
      <summary>{playbook.draft ? "Draft playbook" : "Playbook"}: {playbook.title}</summary>
      {fastPath ? <p className="mt-2 text-xs text-ink-2">For reference after escalating.</p> : null}
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {playbook.steps.map((step, index) => (
          <li key={`${index}-${step}`}>{step}</li>
        ))}
      </ol>
      {playbook.draft ? <p className="mt-2 text-xs text-ink-2">Draft: check each step before using it.</p> : null}
    </details>
  );
}

function SimilarTickets({ items }: { items: SimilarTicket[] }) {
  return (
    <details className="disclosure card">
      <summary>Similar past tickets ({items.length})</summary>
      {items.length === 0 ? <p className="mt-2 text-ink-2">No similar past tickets found.</p> : null}
      <ul className="mt-1 divide-y divide-line">
        {items.map((item) => (
          <li key={item.ticket_id} className="py-2.5">
            <p className="line-clamp-2 font-medium">{item.description}</p>
            <p className="text-[13px] text-ink-2">
              <span className="font-mono">{item.ticket_id}</span>
              {" · "}
              {Math.round(item.similarity <= 1 ? item.similarity * 100 : item.similarity)}% match
              {" · "}
              {item.eng_outcome ? humanize(item.eng_outcome) : "Not recorded"}
              {" · closed "}
              {formatDateTime(item.closed_at)}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function PrecheckPanel({
  data,
  isP1Ticket,
  updating,
  onProofChange,
}: {
  data: PrecheckResponse;
  isP1Ticket: boolean;
  updating: boolean;
  onProofChange: (key: string, proof: string) => void;
}) {
  return (
    <div className="space-y-3">
      {isP1Ticket ? null : <VerdictSummary data={data} updating={updating} />}
      {data.known_issue ? <KnownIssue issue={data.known_issue} fastPath={isP1Ticket} /> : null}
      <Checklist items={data.checklist} fastPath={isP1Ticket} onProofChange={onProofChange} />
      {data.playbook && data.playbook.steps.length > 0 ? (
        <PlaybookSteps playbook={data.playbook} fastPath={isP1Ticket} />
      ) : null}
      <SimilarTickets items={data.similar} />
    </div>
  );
}

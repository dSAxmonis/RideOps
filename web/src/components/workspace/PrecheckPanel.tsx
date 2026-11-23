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

const VERDICT_COPY: Record<Verdict, { label: string; lead: string; icon: IconName; tone: string }> = {
  likely_known_issue: {
    label: "Likely a known issue",
    lead: "Past tickets suggest this may not need engineering.",
    icon: "info",
    tone: "text-warning",
  },
  try_l1_fix: {
    label: "Try an L1 fix first",
    lead: "An L1 fix may resolve this without engineering.",
    icon: "wrench",
    tone: "text-serious",
  },
  needs_info: {
    label: "More information needed",
    lead: "Engineering would likely need more detail to act on this.",
    icon: "alert",
    tone: "text-serious",
  },
  ready_to_escalate: {
    label: "Ready to escalate",
    lead: "The evidence supports sending this to engineering.",
    icon: "check",
    tone: "text-good",
  },
};

export const verdictLabel = (verdict: Verdict) => VERDICT_COPY[verdict].label;

const sectionTitle = "mb-1 text-xs font-semibold text-ink-2";

export function P1FastPath() {
  return (
    <section aria-label="P1 fast path" className="border-l-2 border-critical bg-surface px-3 py-2">
      <p className="flex items-center gap-1.5 text-[15px] font-semibold">
        <Icon name="bolt" className="text-critical" />
        P1 fast path: escalate now
      </p>
      <p className="text-ink-2">Evidence is optional. This check never advises holding a P1.</p>
    </section>
  );
}

function VerdictSummary({ data, updating }: { data: PrecheckResponse; updating: boolean }) {
  const copy = VERDICT_COPY[data.verdict];
  return (
    <section aria-label="Advice" aria-busy={updating} className="bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2">
        <Icon name={copy.icon} className={copy.tone} />
        <h2 className="text-[15px] font-semibold">{copy.label}</h2>
        <span className="text-xs text-ink-2">{humanize(data.confidence_band)} confidence</span>
        {updating ? <span role="status" className="ml-auto text-xs text-ink-2">Re-checking</span> : null}
      </div>
      <p className="text-ink-2">{copy.lead}</p>
      {data.suggested_action ? (
        <p className="mt-1">
          <span className="font-medium">Suggested: </span>
          {data.suggested_action}
        </p>
      ) : null}
      {data.reasons.length > 0 ? (
        <>
          <h3 className={`${sectionTitle} mt-2`}>Why</h3>
          <ul className="list-disc space-y-0.5 pl-4">
            {data.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function proofStatus(item: ChecklistItem) {
  if (item.done) return "Done";
  const count = proofChars(item.proof);
  if (count === 0) return item.required ? "Required" : "Optional";
  return `${MIN_PROOF_CHARS - count > 0 ? MIN_PROOF_CHARS - count : 0} more characters`;
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
  return (
    <section aria-label="Evidence checklist" className="bg-surface px-3 py-2">
      <h3 className={sectionTitle}>Evidence{fastPath ? " (optional)" : ""}</h3>
      <p className="mb-1 text-xs text-ink-2">
        Add a short proof for each item. It counts from {MIN_PROOF_CHARS} characters.
      </p>
      {items.length === 0 ? <p className="text-ink-2">No evidence needed for this ticket.</p> : null}
      <ul className="space-y-2">
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
                <span className="shrink-0 text-xs text-ink-2">
                  {fastPath && !item.done && proofChars(item.proof) === 0 ? "Optional" : proofStatus(item)}
                </span>
              </div>
              <input
                id={inputId}
                value={item.proof}
                maxLength={MAX_PROOF_CHARS}
                onChange={(event) => onProofChange(item.key, event.target.value)}
                placeholder="Short proof"
                aria-describedby={item.proof_hint ? hintId : undefined}
                autoComplete="off"
                className="mt-0.5 h-8 w-full rounded border border-line bg-surface px-2"
              />
              {item.proof_hint ? (
                <p id={hintId} className="mt-0.5 text-xs text-ink-2">{item.proof_hint}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function KnownIssue({ issue, fastPath }: { issue: KnownIssueMatch; fastPath: boolean }) {
  return (
    <section aria-label="Known issue" className="border-l-2 border-warning bg-surface px-3 py-2">
      <p className="text-xs font-semibold text-ink-2">Known issue</p>
      <p className="text-[15px] font-semibold">{issue.title}</p>
      <p className="text-xs text-ink-2">
        {issue.duplicate_count} past duplicates. Last seen {formatDateTime(issue.last_seen)}.
        {fastPath ? " Context only: do not delay this P1." : ""}
      </p>
    </section>
  );
}

function PlaybookSteps({ playbook, fastPath }: { playbook: Playbook; fastPath: boolean }) {
  return (
    <section aria-label="Playbook" className="bg-surface px-3 py-2">
      <h3 className={sectionTitle}>
        {playbook.draft ? "Draft playbook" : "Playbook"}: {playbook.title}
      </h3>
      {fastPath ? <p className="mb-1 text-xs text-ink-2">For reference after escalating.</p> : null}
      <ol className="list-decimal space-y-0.5 pl-5">
        {playbook.steps.map((step, index) => (
          <li key={`${index}-${step}`}>{step}</li>
        ))}
      </ol>
      {playbook.draft ? <p className="mt-1 text-xs text-ink-2">Draft: check each step before using it.</p> : null}
    </section>
  );
}

function SimilarTickets({ items }: { items: SimilarTicket[] }) {
  return (
    <section aria-label="Similar past tickets" className="bg-surface px-3 py-2">
      <h3 className={sectionTitle}>Similar past tickets</h3>
      {items.length === 0 ? <p className="text-ink-2">No similar past tickets found.</p> : null}
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.ticket_id} className="py-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-2">
              <span className="font-mono">{item.ticket_id}</span>
              <span>{item.category ?? "n/a"}</span>
              <span className="tabular-nums">{Math.round((item.similarity <= 1 ? item.similarity * 100 : item.similarity))}% match</span>
              <span className="ml-auto">Closed {formatDateTime(item.closed_at)}</span>
            </div>
            <p className="line-clamp-2">{item.description}</p>
            <p className="text-[13px]">
              <span className="text-ink-2">Engineering outcome: </span>
              {item.eng_outcome ? humanize(item.eng_outcome) : "Not recorded"}
            </p>
          </li>
        ))}
      </ul>
    </section>
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
    <div className="space-y-px bg-line">
      {isP1Ticket ? null : <VerdictSummary data={data} updating={updating} />}
      {data.known_issue ? <KnownIssue issue={data.known_issue} fastPath={isP1Ticket} /> : null}
      {data.playbook && data.playbook.steps.length > 0 ? (
        <PlaybookSteps playbook={data.playbook} fastPath={isP1Ticket} />
      ) : null}
      <Checklist items={data.checklist} fastPath={isP1Ticket} onProofChange={onProofChange} />
      <SimilarTickets items={data.similar} />
    </div>
  );
}

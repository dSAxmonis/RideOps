"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchTicket, runPrecheck, submitDecision } from "@/lib/api";
import type { DecisionAction, DecisionRequest, Evidence, Ticket } from "@/lib/contract";
import { formatDateTime, humanize, isP1, isTicketClosed, isValidProof, validEvidence } from "@/lib/domain";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ErrorNotice, LoadingRows, QueryBoundary } from "@/components/QueryStates";
import { DecisionBar } from "@/components/workspace/DecisionBar";
import { P1FastPath, PrecheckPanel } from "@/components/workspace/PrecheckPanel";

const PROOF_DEBOUNCE_MS = 500;

function TicketDetails({ ticket }: { ticket: Ticket }) {
  const fields: [string, string][] = [
    ["Client", ticket.client_name ?? "n/a"],
    ["Category", ticket.category ?? "n/a"],
    ["Status", humanize(ticket.status)],
    ["Created", formatDateTime(ticket.created_at)],
  ];
  const more: [string, string][] = [
    ["Client tier", ticket.client_tier ?? "n/a"],
    ["Channel", ticket.channel ?? "n/a"],
    ["Agent", ticket.assigned_agent ?? "Unassigned"],
    ["Sent to engineering", ticket.escalated_to_eng ? "Yes" : "No"],
  ];
  // Post-triage fields are null on open tickets, so these rows appear only on history.
  const optional: [string, string | null][] = [
    ["Client ID", ticket.client_id],
    ["First response", ticket.first_response_at && formatDateTime(ticket.first_response_at)],
    ["Engineering ticket", ticket.eng_ticket_id],
    ["Engineering handoffs", ticket.eng_handoffs === null ? null : String(ticket.eng_handoffs)],
    ["Engineering outcome", ticket.eng_outcome && humanize(ticket.eng_outcome)],
    ["First closed", ticket.first_closed_at && formatDateTime(ticket.first_closed_at)],
    ["Final closed", ticket.final_closed_at && formatDateTime(ticket.final_closed_at)],
    ["Reopens", ticket.reopen_count === null ? null : String(ticket.reopen_count)],
    ["CSAT", ticket.csat_score === null ? null : String(ticket.csat_score)],
  ];
  for (const [label, value] of optional) {
    if (value !== null) more.push([label, value]);
  }
  const list = (rows: [string, string][]) => (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-2">{label}</dt>
          <dd className="text-right break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <article className="card">
      <div className="flex items-center gap-2">
        <PriorityBadge priority={ticket.priority} />
        <span className="font-mono text-[13px] text-ink-2">{ticket.ticket_id}</span>
      </div>
      <h1 className="mt-3 text-2xl leading-tight font-medium tracking-tight break-words">
        {ticket.description || "No description"}
      </h1>
      <div className="mt-5 border-t border-line pt-4">{list(fields)}</div>
      <details className="disclosure mt-4 border-t border-line pt-3">
        <summary>More details</summary>
        <div className="mt-3">{list(more)}</div>
      </details>
    </article>
  );
}

function CheckColumn({ ticket }: { ticket: Ticket }) {
  const queryClient = useQueryClient();
  const id = ticket.ticket_id;
  const fastPath = isP1(ticket.priority);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sentEvidence, setSentEvidence] = useState<Evidence>({});
  const [note, setNote] = useState("");
  const [sentNote, setSentNote] = useState("");
  const [recorded, setRecorded] = useState<DecisionAction | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSentNote(note.trim()), 600);
    return () => clearTimeout(timer);
  }, [note]);

  const evidence = useMemo(() => validEvidence(drafts), [drafts]);
  const evidenceKey = JSON.stringify(evidence);
  useEffect(() => {
    const timer = setTimeout(() => setSentEvidence(JSON.parse(evidenceKey) as Evidence), PROOF_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [evidenceKey]);
  const evidencePending = evidenceKey !== JSON.stringify(sentEvidence);

  const precheck = useQuery({
    queryKey: ["precheck", id, sentEvidence, sentNote],
    queryFn: ({ signal }) =>
      runPrecheck(id, { evidence: sentEvidence, ...(sentNote ? { note: sentNote } : {}) }, signal),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 60_000,
  });

  const decision = useMutation({
    mutationFn: (body: DecisionRequest) => submitDecision(id, body),
    onSuccess: async (_result, body) => {
      setRecorded(body.action);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
        queryClient.invalidateQueries({ queryKey: ["ticket", id] }),
        queryClient.invalidateQueries({ queryKey: ["burndown"] }),
        queryClient.invalidateQueries({ queryKey: ["metrics", "live"] }),
      ]);
    },
  });

  const verdict = precheck.isError ? null : (precheck.data?.verdict ?? null);
  const noActionNeeded = recorded === null && (isTicketClosed(ticket.status) || ticket.escalated_to_eng);
  const actions = noActionNeeded ? (
    <p role="status" className="card text-ink-2">
      {ticket.escalated_to_eng ? "Already with engineering." : "This ticket is closed."} No action needed.
    </p>
  ) : (
    <DecisionBar
      priority={ticket.priority}
      verdict={verdict}
      gated={precheck.isError ? undefined : precheck.data?.escalation_gated}
      evidence={evidence}
      checking={precheck.isFetching || evidencePending}
      submitting={decision.isPending}
      error={decision.error}
      recorded={recorded}
      onSubmit={(body, options) => decision.mutate(body, options)}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-1">
        <h2 className="card-title">Pre-Escalation Check</h2>
        <p className="text-[13px] text-ink-2">
          {precheck.data?.mode === "enforce"
            ? "Enforce: missing proof needs a logged reason. P1s are never gated."
            : "Monitor: advice is logged and nothing is gated."}
        </p>
      </div>

      {fastPath ? <P1FastPath /> : null}
      {fastPath ? actions : null}

      {precheck.isError ? (
        <ErrorNotice error={precheck.error} onRetry={() => void precheck.refetch()} />
      ) : (
        <QueryBoundary query={precheck} loading={<LoadingRows rows={4} />}>
          {(data) => {
            const checklist = data.checklist.map((item) => {
              const draft = drafts[item.key];
              return draft === undefined
                ? item
                : { ...item, proof: draft, done: isValidProof(draft) };
            });
            return (
              <PrecheckPanel
                data={{ ...data, checklist }}
                isP1Ticket={fastPath}
                updating={precheck.isFetching || evidencePending}
                onProofChange={(key, proof) => setDrafts((current) => ({ ...current, [key]: proof }))}
              />
            );
          }}
        </QueryBoundary>
      )}

      <details className="disclosure card">
        <summary>Add a note (optional)</summary>
        <label htmlFor="precheck-note" className="sr-only">
          Note for the check (optional)
        </label>
        <textarea
          id="precheck-note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2"
        />
      </details>

      {fastPath ? null : actions}
    </div>
  );
}

export function TicketWorkspace({ id }: { id: string }) {
  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: ({ signal }) => fetchTicket(id, signal),
  });
  return (
    <div className="space-y-4">
      <nav aria-label="Back" className="flex gap-4 text-ink-2">
        <Link href="/burndown" className="hover:text-ink">← Burn-down</Link>
        <Link href="/queue" className="hover:text-ink">← Queue</Link>
      </nav>
      <QueryBoundary query={ticket} loading={<LoadingRows rows={8} />}>
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
            <TicketDetails ticket={data} />
            <CheckColumn key={data.ticket_id} ticket={data} />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}

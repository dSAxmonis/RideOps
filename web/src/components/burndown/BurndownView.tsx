"use client";

import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { fetchBurndown, submitBacklogAction } from "@/lib/api";
import {
  applyState,
  availableActions,
  awaitingNextAction,
  isCleared,
  sortBurndown,
} from "@/lib/burndown";
import type { BacklogAction, Burndown, BurndownItem } from "@/lib/contract";
import { useAgentName } from "@/lib/useAgentName";
import { Icon } from "@/components/Icon";
import { PriorityBadge } from "@/components/PriorityBadge";
import { Select } from "@/components/Select";
import { EmptyNotice, LoadingRows, QueryBoundary, buttonClass, primaryButtonClass } from "@/components/QueryStates";

const QUERY_KEY = ["burndown"];
const MUTATION_KEY = ["backlog-action"];
const PAGE_SIZE = 7;
const FEATURED_LANES = ["confirm_fix", "get_info", "apply_config", "l1_triage"];
const GRID =
  "lg:grid lg:grid-cols-[3.5rem_minmax(0,2.6fr)_minmax(0,1fr)_4rem_7rem_8rem] lg:items-center lg:gap-3";
const ACTION_LABEL: Record<BacklogAction, string> = {
  cleared: "Clear",
  waiting_client: "Waiting on client",
  reopened: "Reopen",
};
const STATE_LABEL: Record<string, string> = {
  cleared: "Cleared here",
  waiting_client: "Waiting on client",
  reopened: "Reopened",
};
const STATE_AFTER: Record<BacklogAction, string> = {
  cleared: "cleared",
  waiting_client: "waiting_client",
  reopened: "reopened",
};
const VERDICT_CHIP: Record<string, { label: string; tone: string }> = {
  Fixed: { label: "Fixed", tone: "bg-good-soft text-good" },
  "Insufficient info - returned to L1": { label: "Needs info", tone: "bg-serious-soft text-serious-text" },
  "Config issue - returned to L1": { label: "Config", tone: "bg-serious-soft text-serious-text" },
  "Duplicate of known issue": { label: "Duplicate", tone: "bg-serious-soft text-serious-text" },
  "Not a bug - how-to": { label: "How-to", tone: "bg-serious-soft text-serious-text" },
  "Not reproducible": { label: "No repro", tone: "bg-serious-soft text-serious-text" },
};

const formatHours = (hours: number) =>
  hours < 48 ? `${Math.round(hours)}h` : `${Math.floor(hours / 24)}d`;

interface ActionVariables {
  ticketId: string;
  action: BacklogAction;
  agent: string;
}

function useBacklogAction(onFailure: (ticketId: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: ({ ticketId, action, agent }: ActionVariables) =>
      submitBacklogAction(ticketId, { action, agent }),
    onMutate: async ({ ticketId, action }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const row = queryClient
        .getQueryData<Burndown>(QUERY_KEY)
        ?.items.find((item) => item.ticket_id === ticketId);
      queryClient.setQueryData<Burndown>(QUERY_KEY, (data) =>
        data ? applyState(data, ticketId, STATE_AFTER[action], new Date().toISOString()) : data,
      );
      return { previous: row ? { state: row.state, at: row.last_action_at } : null };
    },
    // Restores only this row, so overlapping actions on other rows survive.
    onError: (_error, { ticketId }, context) => {
      const previous = context?.previous;
      if (previous) {
        queryClient.setQueryData<Burndown>(QUERY_KEY, (data) =>
          data ? applyState(data, ticketId, previous.state, previous.at) : data,
        );
      }
      onFailure(ticketId);
    },
    onSettled: async () => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) > 1) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["metrics", "live"] }),
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
      ]);
    },
  });
}

function VerdictChip({ outcome }: { outcome: string | null }) {
  const chip = outcome ? VERDICT_CHIP[outcome] : null;
  return (
    <span
      title={outcome ?? "No engineering verdict yet"}
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${chip?.tone ?? "bg-raised text-ink-2"}`}
    >
      {chip?.label ?? (outcome || "No verdict")}
    </span>
  );
}

function Row({
  item,
  laneLabel,
  busy,
  failed,
  onAction,
}: {
  item: BurndownItem;
  laneLabel: string;
  busy: boolean;
  failed: boolean;
  onAction: (action: BacklogAction) => void;
}) {
  const cleared = isCleared(item);
  const stateLabel = STATE_LABEL[item.state];
  const [primary, ...others] = availableActions(item.state);
  return (
    <li className={`border-b border-line py-3 last:border-b-0 ${GRID}`}>
      <div className="flex items-center justify-between lg:block">
        <PriorityBadge priority={item.priority} />
        <span className="text-xs text-ink-2 tabular-nums lg:hidden">{formatHours(item.age_hours)} old</span>
      </div>
      <div className={`mt-1.5 min-w-0 lg:mt-0 ${cleared ? "text-ink-2" : ""}`}>
        <Link
          href={`/tickets/${encodeURIComponent(item.ticket_id)}`}
          className="block truncate font-medium hover:text-accent"
          title={item.description}
        >
          {item.description || "No description"}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
          <span className="font-mono">{item.ticket_id}</span>
          {item.status_mismatch ? (
            <span
              className="inline-flex items-center gap-1 font-medium text-serious-text"
              title={`Source status is "${item.status}", but engineering has already given a verdict.`}
            >
              <Icon name="alert" className="h-3 w-3" />
              Status mismatch
            </span>
          ) : null}
          {stateLabel ? <span className="font-medium">{stateLabel}</span> : null}
        </div>
      </div>
      <p className="mt-1 truncate text-ink-2 lg:mt-0" title={item.next_action ?? undefined}>
        {laneLabel}
      </p>
      <p className="hidden text-ink-2 tabular-nums lg:block">{formatHours(item.age_hours)}</p>
      <div className="mt-1.5 lg:mt-0">
        <VerdictChip outcome={item.eng_outcome} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1 lg:mt-0">
        {primary ? (
          <button
            type="button"
            disabled={busy}
            aria-label={`${ACTION_LABEL[primary]} ${item.ticket_id}`}
            onClick={() => onAction(primary)}
            className="min-h-8 rounded-lg border border-line px-3 text-[13px] font-medium hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ACTION_LABEL[primary]}
          </button>
        ) : null}
        {others.length > 0 ? (
          <details className="menu relative">
            <summary
              aria-label={`More actions for ${item.ticket_id}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-raised"
            >
              <Icon name="more" />
            </summary>
            <div className="absolute right-0 z-20 mt-1 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-lg">
              {others.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={busy}
                  aria-label={`${ACTION_LABEL[action]} ${item.ticket_id}`}
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    onAction(action);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-raised disabled:opacity-50"
                >
                  {ACTION_LABEL[action]}
                </button>
              ))}
            </div>
          </details>
        ) : null}
        {failed ? (
          <span role="alert" className="w-full text-right text-xs text-critical-text">
            Not saved. Restored.
          </span>
        ) : null}
      </div>
    </li>
  );
}

function RingGauge({ percent }: { percent: number }) {
  const ticks = 72;
  const active = Math.round((percent / 100) * ticks);
  return (
    <svg viewBox="0 0 160 160" aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90">
      {Array.from({ length: ticks }, (_, index) => {
        const angle = (index / ticks) * Math.PI * 2;
        const round = (value: number) => Math.round(value * 100) / 100;
        return (
          <line
            key={index}
            x1={round(80 + Math.cos(angle) * 66)}
            y1={round(80 + Math.sin(angle) * 66)}
            x2={round(80 + Math.cos(angle) * 78)}
            y2={round(80 + Math.sin(angle) * 78)}
            stroke="white"
            strokeWidth="1.6"
            strokeOpacity={index < active ? 1 : 0.28}
          />
        );
      })}
    </svg>
  );
}

function BacklogStatus({ data, waiting }: { data: Burndown; waiting: number }) {
  const live = data.items.filter((item) => !isCleared(item));
  const fixed = live.filter((item) => item.eng_outcome === "Fixed").length;
  const noVerdict = live.filter((item) => !item.eng_outcome).length;
  const otherVerdict = live.length - fixed - noVerdict;
  const total = Math.max(live.length, 1);
  const segments = [
    { label: "Fixed", value: fixed, bar: "bg-good" },
    { label: "Other verdict", value: otherVerdict, bar: "bg-warning" },
    { label: "No verdict", value: noVerdict, bar: "bg-critical" },
  ];
  return (
    <section aria-label="Backlog status" className="card space-y-4">
      <h2 className="card-title">Backlog Status</h2>
      <div className="flex gap-1">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div key={segment.label} style={{ flexGrow: segment.value, flexBasis: 0 }} className="min-w-0">
              <p className="mb-1 text-[13px] tabular-nums">{Math.round((segment.value / total) * 100)}%</p>
              <div className="h-9 border-l border-line" />
              <div className={`h-1.5 ${segment.bar}`} />
            </div>
          ) : null,
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {segments.map((segment) => (
          <div key={segment.label} className="rounded-xl border border-line px-3 py-2">
            <p className="flex items-center gap-1.5 font-medium tabular-nums">
              <span className={`h-1.5 w-1.5 rounded-full ${segment.bar}`} />
              {segment.value}
            </p>
            <p className="truncate text-[13px] text-ink-2">{segment.label}</p>
          </div>
        ))}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-medium tracking-tight tabular-nums">{data.open_now}</span>
        <span className="text-ink-2">Open now</span>
        <span className="ml-auto text-[13px] text-ink-2 tabular-nums">{data.cleared} cleared</span>
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-serious-soft px-3 py-2.5 text-[13px]">
        <Icon name="info" className="mt-0.5 text-serious" />
        <span>{waiting} open tickets already have an engineering verdict and are waiting on a next action.</span>
      </p>
    </section>
  );
}

function DayOneCard({ data, waiting }: { data: Burndown; waiting: number }) {
  const fixed = data.items.filter((item) => !isCleared(item) && item.eng_outcome === "Fixed").length;
  const percent = data.open_now > 0 ? Math.round((waiting / data.open_now) * 100) : 0;
  return (
    <section aria-label="Day-1 opportunity" className="hero-card flex flex-col">
      <h2 className="card-title">Day-1 Opportunity</h2>
      <div className="mt-4 flex flex-1 flex-wrap items-center justify-center gap-4">
        <div className="relative h-40 w-40 shrink-0">
          <RingGauge percent={percent} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-3xl font-medium tabular-nums">{percent}%</p>
            <p className="text-xs text-white/80">have a verdict</p>
          </div>
        </div>
        <div className="min-w-32 flex-1 space-y-2">
          <div className="glass-tile">
            <p className="font-medium tabular-nums">{fixed}</p>
            <p className="text-[13px] text-white/80">Fixed, confirm now</p>
          </div>
          <div className="glass-tile">
            <p className="font-medium tabular-nums">{data.open_now - fixed}</p>
            <p className="text-[13px] text-white/80">Open if confirmed</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BurndownContent({ data }: { data: Burndown }) {
  const router = useRouter();
  const params = useSearchParams();
  const [agent, setAgent] = useAgentName();
  const [agentMissing, setAgentMissing] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const mutation = useBacklogAction(setFailedId);
  const pendingIds = useMutationState({
    filters: { mutationKey: MUTATION_KEY, status: "pending" },
    select: (entry) => (entry.state.variables as ActionVariables | undefined)?.ticketId,
  });

  const laneParam = params.get("lane");
  const activeLane = data.lanes.some((lane) => lane.lane === laneParam) ? laneParam : null;
  const rows = sortBurndown(
    activeLane ? data.items.filter((item) => item.lane === activeLane) : data.items,
  );
  const waiting = awaitingNextAction(data.items);
  const pages = Math.max(Math.ceil(rows.length / PAGE_SIZE), 1);
  const currentPage = Math.min(page, pages - 1);
  const shown = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const featured = FEATURED_LANES.flatMap((id) => data.lanes.filter((lane) => lane.lane === id));
  const otherLanes = data.lanes.filter((lane) => !FEATURED_LANES.includes(lane.lane));

  const setLane = (lane: string | null) => {
    setPage(0);
    router.replace(lane ? `/burndown?lane=${encodeURIComponent(lane)}` : "/burndown", { scroll: false });
  };

  const act = (ticketId: string, action: BacklogAction) => {
    const name = agent.trim();
    if (!name) {
      setAgentMissing(true);
      document.getElementById("burndown-agent")?.focus();
      return;
    }
    setAgentMissing(false);
    setFailedId(null);
    mutation.mutate({ ticketId, action, agent: name });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Burn-down</h1>
        <Link href="/queue" className={primaryButtonClass}>
          Open Queue
          <Icon name="arrow" />
        </Link>
      </div>

      <div className="space-y-4">
        <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div role="group" aria-label="Filter by lane" className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4 xl:col-span-1 xl:grid-cols-2">
            {featured.map((lane) => {
              const active = activeLane === lane.lane;
              return (
                <button
                  key={lane.lane}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLane(active ? null : lane.lane)}
                  className={`card text-left transition hover:shadow-md ${active ? "bg-tint ring-2 ring-accent" : ""}`}
                >
                  <span className="flex items-start justify-between">
                    <Icon name="folder" className="h-9 w-9 text-accent" />
                    <span className="icon-tile">
                      <Icon name="arrow" />
                    </span>
                  </span>
                  <span className="mt-4 block font-medium">{lane.label}</span>
                  <span className="block text-ink-2 tabular-nums">
                    {lane.count} {lane.count === 1 ? "ticket" : "tickets"}
                  </span>
                </button>
              );
            })}
          </div>
          <BacklogStatus data={data} waiting={waiting} />
          <DayOneCard data={data} waiting={waiting} />
        </div>

          <section aria-label="Backlog" className="card">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={!activeLane}
                onClick={() => setLane(null)}
                className={activeLane ? buttonClass : primaryButtonClass}
              >
                All <span className="tabular-nums">{data.open_now}</span>
              </button>
              {otherLanes.length > 0 ? (
                <Select
                  label="Other lanes"
                  value={otherLanes.some((lane) => lane.lane === activeLane) ? (activeLane ?? "") : ""}
                  onChange={(value) => setLane(value || null)}
                  options={[
                    { value: "", label: "More lanes" },
                    ...otherLanes.map((lane) => ({ value: lane.lane, label: `${lane.label} (${lane.count})` })),
                  ]}
                />
              ) : null}
              <div className="flex min-w-0 basis-full items-center justify-end gap-2 sm:flex-1 sm:basis-auto">
                <label htmlFor="burndown-agent" className="shrink-0 text-[13px] text-ink-2">Acting as</label>
                <input
                  id="burndown-agent"
                  value={agent}
                  onChange={(event) => {
                    setAgent(event.target.value);
                    setAgentMissing(false);
                  }}
                  maxLength={80}
                  placeholder="Your name"
                  autoComplete="name"
                  aria-invalid={agentMissing || undefined}
                  aria-describedby={agentMissing ? "burndown-agent-error" : undefined}
                  className={`h-10 min-w-0 flex-1 rounded-xl border bg-surface px-3 sm:w-36 sm:flex-none ${agentMissing ? "border-critical" : "border-line"}`}
                />
              </div>
              {agentMissing ? (
                <p id="burndown-agent-error" role="alert" className="w-full text-right text-[13px] text-critical-text">
                  Add your name to record an action.
                </p>
              ) : null}
            </div>

            {rows.length === 0 ? (
              <p className="py-10 text-center text-ink-2">
                {activeLane ? "No tickets in this lane." : "No tickets in the backlog."}
              </p>
            ) : (
              <div className="mt-3">
                <div aria-hidden="true" className={`hidden border-b border-line pb-2 text-[13px] text-ink-2 ${GRID}`}>
                  <span>Pri</span>
                  <span>Ticket</span>
                  <span>Next step</span>
                  <span>Age</span>
                  <span>Verdict</span>
                  <span className="text-right">Action</span>
                </div>
                <ul aria-label="Backlog tickets">
                  {shown.map((item) => (
                    <Row
                      key={item.ticket_id}
                      item={item}
                      laneLabel={data.lanes.find((lane) => lane.lane === item.lane)?.label ?? "n/a"}
                      busy={pendingIds.includes(item.ticket_id)}
                      failed={failedId === item.ticket_id}
                      onAction={(action) => act(item.ticket_id, action)}
                    />
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-2">
                  <p>Clearing is recorded in this tool only. It does not change the source ticket data.</p>
                  {pages > 1 ? (
                    <div className="flex items-center gap-2">
                      <button type="button" className={buttonClass} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                        Previous
                      </button>
                      <span className="tabular-nums">{currentPage + 1} / {pages}</span>
                      <button type="button" className={buttonClass} disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>
      </div>
    </div>
  );
}

export function BurndownView() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => fetchBurndown(signal),
    staleTime: 10_000,
  });
  return (
    <QueryBoundary query={query} loading={<LoadingRows rows={10} />}>
      {(data) =>
        data.items.length === 0 && data.open_at_snapshot === 0 ? (
          <EmptyNotice>No tickets in the backlog.</EmptyNotice>
        ) : (
          <Suspense fallback={<LoadingRows rows={10} />}>
            <BurndownContent data={data} />
          </Suspense>
        )
      }
    </QueryBoundary>
  );
}

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
import { formatDateTime, humanize } from "@/lib/domain";
import { useAgentName } from "@/lib/useAgentName";
import { Icon } from "@/components/Icon";
import { PriorityBadge } from "@/components/PriorityBadge";
import { EmptyNotice, LoadingRows, QueryBoundary } from "@/components/QueryStates";

const QUERY_KEY = ["burndown"];
const MUTATION_KEY = ["backlog-action"];
const GRID =
  "lg:grid lg:grid-cols-[3rem_minmax(0,1.5fr)_8.5rem_7rem_minmax(0,1.2fr)_3.5rem_13rem] lg:items-center lg:gap-3";
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

function Row({
  item,
  busy,
  failed,
  onAction,
}: {
  item: BurndownItem;
  busy: boolean;
  failed: boolean;
  onAction: (action: BacklogAction) => void;
}) {
  const cleared = isCleared(item);
  const stateLabel = STATE_LABEL[item.state];
  return (
    <li className={`border-b border-line px-3 py-2 last:border-b-0 lg:py-1.5 ${GRID}`}>
      <div className="flex items-center justify-between lg:block">
        <PriorityBadge priority={item.priority} />
        <span className="text-xs text-ink-2 tabular-nums lg:hidden">{formatHours(item.age_hours)} old</span>
      </div>
      <div className={`mt-1 min-w-0 lg:mt-0 ${cleared ? "text-ink-2" : ""}`}>
        <div className="flex flex-wrap items-center gap-x-2">
          <Link
            href={`/tickets/${encodeURIComponent(item.ticket_id)}`}
            className="font-mono text-xs text-accent underline-offset-2 hover:underline"
          >
            {item.ticket_id}
          </Link>
          <span className="truncate text-xs text-ink-2">
            {item.client_name ?? "n/a"} · {item.category ?? "n/a"}
          </span>
        </div>
        <p className="truncate" title={item.description}>{item.description || "No description"}</p>
        <div className="flex flex-wrap gap-x-2 empty:hidden">
          {item.status_mismatch ? (
            <span
              className="inline-flex items-center gap-1 text-xs font-medium"
              title={`Source status is "${item.status}", but engineering has already given a verdict.`}
            >
              <Icon name="alert" className="text-serious" />
              Status mismatch
            </span>
          ) : null}
          {stateLabel ? <span className="text-xs font-medium text-ink-2">{stateLabel}</span> : null}
        </div>
      </div>
      <p className="mt-1 text-[13px] lg:mt-0">
        <span className="text-ink-2 lg:hidden">Verdict: </span>
        {item.eng_outcome ? humanize(item.eng_outcome) : <span className="text-ink-2">None yet</span>}
      </p>
      <p className="truncate text-[13px]">
        <span className="text-ink-2 lg:hidden">Owner: </span>
        {item.owner ?? "n/a"}
      </p>
      <p className="text-[13px]">
        <span className="text-ink-2 lg:hidden">Next: </span>
        {item.next_action ?? "n/a"}
      </p>
      <p className="hidden text-right text-ink-2 tabular-nums lg:block">{formatHours(item.age_hours)}</p>
      <div className="mt-1.5 flex flex-wrap justify-end gap-1 lg:mt-0">
        {availableActions(item.state).map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            aria-label={`${ACTION_LABEL[action]} ${item.ticket_id}`}
            onClick={() => onAction(action)}
            className="min-h-8 rounded border border-line bg-surface px-2 text-xs font-medium hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ACTION_LABEL[action]}
          </button>
        ))}
        {failed ? (
          <span role="alert" className="w-full text-right text-xs text-critical-text">
            Not saved. Restored.
          </span>
        ) : null}
      </div>
    </li>
  );
}

function BurndownContent({ data }: { data: Burndown }) {
  const router = useRouter();
  const params = useSearchParams();
  const [agent, setAgent] = useAgentName();
  const [agentMissing, setAgentMissing] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);
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

  const setLane = (lane: string | null) => {
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

  const laneClass = (active: boolean) =>
    `flex min-h-8 items-center gap-1.5 rounded border px-2 text-[13px] ${
      active ? "border-ink-2 bg-raised font-medium" : "border-line bg-surface text-ink-2 hover:text-ink"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-base font-semibold">Burn-down</h1>
        <p className="tabular-nums">
          <span className="text-lg font-semibold">{data.open_now}</span> open now
          <span className="text-ink-2"> vs {data.open_at_snapshot} at snapshot · {data.cleared} cleared</span>
        </p>
        {data.snapshot_at ? (
          <p className="text-xs text-ink-2">Snapshot {formatDateTime(data.snapshot_at)}</p>
        ) : null}
      </div>

      <p className="border-l-2 border-warning bg-surface px-3 py-2 text-[15px] font-medium">
        {waiting} open tickets already have an engineering verdict and are waiting on a next action.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-2">
          Clearing is recorded in this tool only. It does not change the source ticket data.
        </p>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label htmlFor="burndown-agent" className="shrink-0 text-xs text-ink-2">Acting as</label>
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
            className={`h-8 min-w-0 flex-1 rounded border bg-surface px-2 sm:w-44 ${agentMissing ? "border-critical" : "border-line"}`}
          />
        </div>
        {agentMissing ? (
          <p id="burndown-agent-error" role="alert" className="w-full text-right text-[13px] text-critical-text">
            Add your name to record an action.
          </p>
        ) : null}
      </div>

      <div role="group" aria-label="Filter by lane" className="flex flex-wrap gap-1">
        <button type="button" aria-pressed={!activeLane} onClick={() => setLane(null)} className={laneClass(!activeLane)}>
          All <span className="tabular-nums">{data.open_now}</span>
        </button>
        {data.lanes.map((lane) => (
          <button
            key={lane.lane}
            type="button"
            aria-pressed={activeLane === lane.lane}
            onClick={() => setLane(activeLane === lane.lane ? null : lane.lane)}
            className={laneClass(activeLane === lane.lane)}
          >
            {lane.label} <span className="font-semibold text-ink tabular-nums">{lane.count}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyNotice>{activeLane ? "No tickets in this lane." : "No tickets in the backlog."}</EmptyNotice>
      ) : (
        <div className="border border-line bg-surface">
          <div aria-hidden="true" className={`hidden border-b border-line px-3 py-1.5 text-xs font-medium text-ink-2 ${GRID}`}>
            <span>Pri</span>
            <span>Ticket</span>
            <span>Verdict</span>
            <span>Owner</span>
            <span>Next action</span>
            <span className="text-right">Age</span>
            <span className="text-right">Actions</span>
          </div>
          <ul aria-label="Backlog tickets">
            {rows.map((item) => (
              <Row
                key={item.ticket_id}
                item={item}
                busy={pendingIds.includes(item.ticket_id)}
                failed={failedId === item.ticket_id}
                onAction={(action) => act(item.ticket_id, action)}
              />
            ))}
          </ul>
        </div>
      )}
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
      {(data) => (
        <Suspense fallback={<LoadingRows rows={10} />}>
          <BurndownContent data={data} />
        </Suspense>
      )}
    </QueryBoundary>
  );
}

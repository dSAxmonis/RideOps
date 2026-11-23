"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { MAX_QUEUE_TICKETS, fetchQueue, type TicketFilters } from "@/lib/api";
import type { TicketSummary } from "@/lib/contract";
import { formatAge, sortQueue } from "@/lib/domain";
import { Icon } from "@/components/Icon";
import { PriorityBadge } from "@/components/PriorityBadge";
import { Select } from "@/components/Select";
import { EmptyNotice, QueryBoundary, buttonClass, primaryButtonClass } from "@/components/QueryStates";

const VISIBLE_STEP = 15;
// Ages are measured at the data pull, so they match the burn-down.
const SNAPSHOT_MS = Date.parse("2026-09-30T23:59:00");
const GRID =
  "md:grid md:grid-cols-[3.5rem_7rem_minmax(0,1fr)_minmax(0,18rem)_4rem] md:items-center md:gap-3";
const controlClass = "h-10 min-w-0 rounded-xl border border-line bg-surface px-3 text-ink";

const uniqueSorted = (values: (string | null)[]) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

export function QueueRows({ tickets, now }: { tickets: TicketSummary[]; now: number }) {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(VISIBLE_STEP);
  const rows = useRef<(HTMLAnchorElement | null)[]>([]);
  const shown = tickets.slice(0, visible);
  const current = Math.min(active, Math.max(shown.length - 1, 0));

  const move = (next: number) => {
    const index = Math.max(0, Math.min(shown.length - 1, next));
    setActive(index);
    rows.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const actions: Record<string, () => void> = {
      ArrowDown: () => move(current + 1),
      j: () => move(current + 1),
      ArrowUp: () => move(current - 1),
      k: () => move(current - 1),
      Home: () => move(0),
      End: () => move(shown.length - 1),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className="mt-3">
      <div aria-hidden="true" className={`hidden border-b border-line px-2 pb-2 text-[13px] text-ink-2 ${GRID}`}>
        <span>Pri</span>
        <span>Ticket</span>
        <span>Issue</span>
        <span>Category</span>
        <span className="text-right">Age</span>
      </div>
      <ul aria-label="Tickets" onKeyDown={onKeyDown}>
        {shown.map((ticket, index) => (
          <li key={ticket.ticket_id} className="border-b border-line last:border-b-0">
            <Link
              ref={(node) => {
                rows.current[index] = node;
              }}
              href={`/tickets/${encodeURIComponent(ticket.ticket_id)}`}
              tabIndex={index === current ? 0 : -1}
              onFocus={() => setActive(index)}
              className={`block rounded-lg px-2 py-3 -outline-offset-2 hover:bg-raised ${GRID}`}
            >
              <span className="float-left mr-2 md:float-none md:mr-0">
                <PriorityBadge priority={ticket.priority} />
              </span>
              <span className="font-mono text-xs text-ink-2">{ticket.ticket_id}</span>
              <span className="float-right text-ink-2 tabular-nums md:hidden">{formatAge(ticket.created_at, now)}</span>
              <span className="mt-1 block truncate font-medium md:mt-0">{ticket.description || "No description"}</span>
              <span className="block truncate text-ink-2">{ticket.category ?? "n/a"}</span>
              <span className="hidden text-right text-ink-2 tabular-nums md:block">{formatAge(ticket.created_at, now)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {tickets.length > visible ? (
        <div className="border-t border-line pt-3 text-center">
          <button type="button" className={buttonClass} onClick={() => setVisible(visible + VISIBLE_STEP)}>
            Show more ({tickets.length - visible} left)
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function QueueView() {
  const router = useRouter();
  const params = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const urlQuery = params.get("q") ?? "";
  const [draft, setDraft] = useState(urlQuery);
  const now = SNAPSHOT_MS;

  const filters: TicketFilters = {
    status: params.get("status") === "all" ? "all" : "open",
    agent: params.get("agent") ?? undefined,
    category: params.get("category") ?? undefined,
    priority: params.get("priority") ?? undefined,
    q: urlQuery || undefined,
  };
  const hasFilters = Boolean(filters.agent || filters.category || filters.priority || filters.q);

  const setParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const text = next.toString();
    router.replace(text ? `/queue?${text}` : "/queue", { scroll: false });
  };

  useEffect(() => {
    if (draft === urlQuery) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      if (draft) next.set("q", draft);
      else next.delete("q");
      const text = next.toString();
      router.replace(text ? `/queue?${text}` : "/queue", { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, urlQuery, router]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(target.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = useQuery({
    queryKey: ["tickets", filters],
    queryFn: ({ signal }) => fetchQueue(filters, signal),
  });
  const options = useQuery({
    queryKey: ["tickets", { status: filters.status }],
    queryFn: ({ signal }) => fetchQueue({ status: filters.status }, signal),
  });
  const agents = useMemo(
    () => uniqueSorted((options.data?.items ?? []).map((ticket) => ticket.assigned_agent)),
    [options.data],
  );
  const categories = useMemo(
    () => uniqueSorted((options.data?.items ?? []).map((ticket) => ticket.category)),
    [options.data],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="page-title">{filters.status === "open" ? "Open Tickets" : "All Tickets"}</h1>
        {query.data ? <span className="text-xl text-ink-3 tabular-nums">{query.data.total}</span> : null}
      </div>

      <section aria-label="Tickets" className="card">
      <div role="search" className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Status">
          <button type="button" aria-pressed={filters.status === "open"} onClick={() => setParams({ status: "" })} className={filters.status === "open" ? primaryButtonClass : buttonClass}>
            Open
          </button>
          <button type="button" aria-pressed={filters.status === "all"} onClick={() => setParams({ status: "all" })} className={filters.status === "all" ? primaryButtonClass : buttonClass}>
            All
          </button>
        </div>
        <div className="relative min-w-40 flex-1 md:ml-auto md:max-w-72">
          <Icon name="search" className="pointer-events-none absolute top-3 left-3 text-ink-3" />
          <input
            ref={searchRef}
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search.."
            aria-label="Search tickets"
            className={`${controlClass} w-full pl-9`}
          />
        </div>
        <Select
          label="Priority"
          value={filters.priority ?? ""}
          onChange={(priority) => setParams({ priority })}
          options={[{ value: "", label: "All priorities" }, ...["P1", "P2", "P3", "P4"].map((value) => ({ value, label: value }))]}
        />
        <Select
          label="Category"
          value={filters.category ?? ""}
          onChange={(category) => setParams({ category })}
          options={[{ value: "", label: "All categories" }, ...categories.map((value) => ({ value, label: value }))]}
        />
        <Select
          label="Agent"
          value={filters.agent ?? ""}
          onChange={(agent) => setParams({ agent })}
          options={[{ value: "", label: "All agents" }, ...agents.map((value) => ({ value, label: value }))]}
        />
        {hasFilters ? (
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setDraft("");
              setParams({ agent: "", category: "", priority: "", q: "" });
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <QueryBoundary query={query} loading={undefined}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyNotice>{hasFilters ? "No tickets match these filters." : "No open tickets. The queue is clear."}</EmptyNotice>
          ) : (
            <>
              {data.truncated ? (
                <p role="status" className="mt-3 rounded-xl bg-raised px-3 py-2 text-ink-2">
                  Showing {data.items.length} of {data.total}, limit {MAX_QUEUE_TICKETS}. Narrow the filters to see the rest.
                </p>
              ) : null}
              <QueueRows key={JSON.stringify(filters)} tickets={sortQueue(data.items)} now={now} />
            </>
          )
        }
      </QueryBoundary>
      </section>
    </div>
  );
}

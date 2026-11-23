"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { fetchBacktest, fetchLiveMetrics, fetchWeekly, isWakingError } from "@/lib/api";
import type { Backtest, BacktestRun, LiveMetrics, WeekMetrics } from "@/lib/contract";
import { formatRate, humanize, toPercentSeries } from "@/lib/domain";
import { Icon } from "@/components/Icon";
import { EmptyNotice, LoadingRows, QueryBoundary } from "@/components/QueryStates";
import type { TrendPoint } from "@/components/impact/TrendChart";

const TrendChart = dynamic(() => import("@/components/impact/TrendChart"), {
  ssr: false,
  loading: () => <div className="h-[150px] animate-pulse rounded-xl bg-raised" />,
});

const percent = (value: number) => `${value.toFixed(value >= 10 ? 0 : 1)}%`;
const hours = (value: number) => `${value.toFixed(value >= 10 ? 0 : 1)}h`;
const count = (value: number) => value.toFixed(0);
const score = (value: number) => value.toFixed(2);
const axisPercent = (value: number) => `${Math.round(value)}%`;
const axisHours = (value: number) => `${Math.round(value)}h`;
const axisCount = (value: number) => String(Math.round(value));

interface Series {
  key: keyof WeekMetrics;
  title: string;
  hint: string;
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  rate?: boolean;
  domain?: [number, number];
}

const OUTCOMES: Series[] = [
  { key: "avg_open_7d", title: "Open tickets", hint: "7-day average", format: count, axisFormat: axisCount },
  {
    key: "avoidable_escalation_share",
    title: "Avoidable escalation share",
    hint: "Of escalations to engineering",
    format: percent,
    axisFormat: axisPercent,
    rate: true,
  },
];

const GUARDRAILS: Series[] = [
  { key: "reopen_rate", title: "Reopen rate", hint: "Lower is better", format: percent, axisFormat: axisPercent, rate: true },
  { key: "p1p2_median_close_h", title: "P1/P2 median close", hint: "Hours, lower is better", format: hours, axisFormat: axisHours },
  { key: "csat_avg", title: "CSAT", hint: "Average, responders only", format: score, axisFormat: axisCount, domain: [1, 5] },
  {
    key: "csat_response_rate",
    title: "CSAT response rate",
    hint: "How far CSAT can be trusted",
    format: percent,
    axisFormat: axisPercent,
    rate: true,
  },
];

function seriesPoints(weeks: WeekMetrics[], series: Series): TrendPoint[] {
  const raw = weeks.map((week) => week[series.key] as number | null);
  const values = series.rate ? toPercentSeries(raw) : raw;
  return weeks.map((week, index) => ({
    week: week.week_start,
    partial: week.partial,
    value: values[index] ?? null,
  }));
}

function TrendPanel({ weeks, series, height }: { weeks: WeekMetrics[]; series: Series; height?: number }) {
  const points = seriesPoints(weeks, series);
  const latest = [...points].reverse().find((point) => !point.partial && point.value !== null);
  return (
    <figure className="card min-w-0">
      <figcaption className="mb-3 flex items-start justify-between gap-2">
        <span>
          <span className="card-title block">{series.title}</span>
          <span className="block text-[13px] text-ink-2">{series.hint}</span>
        </span>
        <span className="text-right">
          <span className="block text-2xl leading-tight font-medium tracking-tight tabular-nums">
            {latest?.value != null ? series.format(latest.value) : "n/a"}
          </span>
          <span className="block text-xs text-ink-2">last full week</span>
        </span>
      </figcaption>
      {points.some((point) => point.value !== null) ? (
        <TrendChart points={points} format={series.format} axisFormat={series.axisFormat} domain={series.domain} height={height} label={series.title} />
      ) : (
        <p className="py-8 text-center text-ink-2">No data reported.</p>
      )}
    </figure>
  );
}

function DataTable({ weeks }: { weeks: WeekMetrics[] }) {
  const all = [...OUTCOMES, ...GUARDRAILS];
  const columns = all.map((series) => seriesPoints(weeks, series));
  return (
    <details className="disclosure card">
      <summary>Weekly data table</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-right text-[13px] tabular-nums">
          <thead>
            <tr className="border-y border-line text-xs text-ink-2">
              <th scope="col" className="px-3 py-1 text-left font-medium">Week</th>
              <th scope="col" className="px-2 py-1 font-medium">Arrivals</th>
              <th scope="col" className="px-2 py-1 font-medium">Closures</th>
              <th scope="col" className="px-2 py-1 font-medium">Net</th>
              {all.map((series) => (
                <th key={series.key} scope="col" className="px-2 py-1 font-medium">{series.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, rowIndex) => (
              <tr key={week.week_start} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-1 text-left font-normal whitespace-nowrap">
                  {week.week_start.slice(0, 10)}{week.partial ? " (partial)" : ""}
                </th>
                <td className="px-2 py-1">{week.arrivals ?? "n/a"}</td>
                <td className="px-2 py-1">{week.closures ?? "n/a"}</td>
                <td className="px-2 py-1">{week.net_flow ?? "n/a"}</td>
                {all.map((series, columnIndex) => {
                  const value = columns[columnIndex]?.[rowIndex]?.value ?? null;
                  return (
                    <td key={series.key} className="px-2 py-1">
                      {value === null ? "n/a" : series.format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Stat({
  label,
  value,
  note,
  flagged = false,
}: {
  label: string;
  value: ReactNode;
  note: string;
  flagged?: boolean;
}) {
  return (
    <div className="card">
      <p className="flex items-center gap-1 text-ink-2">
        {flagged ? <Icon name="alert" className="text-critical" /> : null}
        {label}
        {flagged ? <span className="sr-only">(needs attention)</span> : null}
      </p>
      <p className="mt-3 text-3xl font-medium tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-[13px] text-ink-2">{note}</p>
    </div>
  );
}

const RESULT_LABELS: Record<string, string> = {
  revised_not_clean_holdout: "Revised policy: not a clean holdout",
  history_hold_v2: "v2: history could hold",
  original_pre_change: "Original replay, before the revision",
};

const resultLabel = (label: string) => RESULT_LABELS[label] ?? humanize(label);
const KNOWN_ISSUE = "likely_known_issue";
const rate = (value: number | null | undefined) => formatRate(value ?? null);
const plain = (value: number | null | undefined) => (value === null || value === undefined ? "n/a" : String(value));
const ofTotal = (value: number | undefined, total: number | null | undefined) =>
  value === undefined ? "n/a" : total === null || total === undefined ? String(value) : `${value} of ${total}`;
const lift = (value: number | null | undefined) =>
  value === null || value === undefined ? "n/a" : `${value.toFixed(1)}x`;

const COMPARISON: { label: string; value: (run: BacktestRun) => string }[] = [
  { label: "Escalations replayed", value: (run) => plain(run.escalations) },
  {
    label: "Fixed bugs delayed",
    value: (run) => ofTotal(run.fixed_bugs_delayed?.count, run.fixed_bugs_delayed?.fixed_total),
  },
  { label: "Fixed bugs delayed, rate", value: (run) => rate(run.fixed_bugs_delayed?.rate) },
  { label: "P1 misses", value: (run) => ofTotal(run.p1?.misses, run.p1?.total) },
  { label: "Known-issue precision", value: (run) => rate(run.precision_by_verdict[KNOWN_ISSUE]?.precision) },
  { label: "Known-issue base rate", value: (run) => rate(run.precision_by_verdict[KNOWN_ISSUE]?.base_rate) },
  { label: "Known-issue lift", value: (run) => lift(run.precision_by_verdict[KNOWN_ISSUE]?.lift) },
  { label: "Advisory flags", value: (run) => plain(run.advisory_flags?.count) },
  { label: "Avoidable among flags", value: (run) => plain(run.advisory_flags?.avoidable) },
  { label: "Held for review", value: (run) => plain(run.held_for_review?.count) },
  { label: "Avoidable caught", value: (run) => plain(run.held_for_review?.avoidable) },
  { label: "Share of avoidable caught", value: (run) => rate(run.held_for_review?.recall_avoidable) },
  { label: "Precision of holds (avoidable)", value: (run) => rate(run.held_for_review?.precision_avoidable) },
];

const windowText = (run: BacktestRun) =>
  run.window ? `${run.window.start.slice(0, 10)} to ${run.window.end.slice(0, 10)}` : "n/a";

export function BacktestResults({ data }: { data: Backtest }) {
  const original = data.original_pre_change ?? null;
  const knownIssue = data.precision_by_verdict[KNOWN_ISSUE];
  const delayed = data.fixed_bugs_delayed;
  const runs: { heading: string; run: BacktestRun }[] = [
    { heading: resultLabel(data.result_label), run: data },
    ...(data.history_hold_v2
      ? [{ heading: resultLabel(data.history_hold_v2.result_label), run: data.history_hold_v2 }]
      : []),
    ...(original ? [{ heading: resultLabel(original.result_label), run: original }] : []),
  ];
  const verdictKeys = [...new Set(runs.flatMap(({ run }) => Object.keys(run.flagged_by_verdict)))];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Fixed bugs delayed"
          value={ofTotal(delayed?.count, delayed?.fixed_total)}
          note={`Replay only (${rate(delayed?.rate)})`}
          flagged={(delayed?.count ?? 0) > 0}
        />
        <Stat
          label="P1 misses"
          value={ofTotal(data.p1?.misses, data.p1?.total)}
          note="The target is 0"
          flagged={(data.p1?.misses ?? 0) > 0}
        />
        <Stat
          label="Known-issue precision"
          value={rate(knownIssue?.precision)}
          note={`${lift(knownIssue?.lift)} lift over ${rate(knownIssue?.base_rate)}`}
        />
        <Stat
          label={data.advisory_flags ? "Avoidable among flags" : "Avoidable caught"}
          value={
            data.advisory_flags
              ? ofTotal(data.advisory_flags.avoidable, data.advisory_flags.count)
              : ofTotal(data.held_for_review?.avoidable, data.held_for_review?.count)
          }
          note={
            data.advisory_flags
              ? "Warnings only, no delay"
              : `${rate(data.held_for_review?.recall_avoidable)} of all avoidable`
          }
        />
      </div>

      <div role="note" className="flex items-start gap-2.5 rounded-[18px] bg-serious-soft px-4 py-3">
        <Icon name="alert" className="mt-0.5 text-serious" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{resultLabel(data.result_label)}</p>
          <p className="text-[13px] text-ink-2">
            Window {windowText(data)}. Policy {data.policy_version ?? "n/a"}.
            {data.clean_holdout ? "" : " Do not read this as a clean holdout."}
          </p>
          <details className="disclosure mt-1.5 text-[13px]">
            <summary>How to read this</summary>
            <p className="mt-1">{data.methodology_note}</p>
          </details>
        </div>
      </div>

      <details className="disclosure card">
        <summary>Compare policy versions</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-right text-[13px] tabular-nums">
          <caption className="sr-only">Revised versus original</caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-2">
              <th scope="col" className="px-3 py-1 text-left font-medium">Measure</th>
              {runs.map(({ heading }) => (
                <th key={heading} scope="col" className="px-3 py-1 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-1 text-left font-normal">{row.label}</th>
                {runs.map(({ heading, run }) => (
                  <td key={heading} className="px-3 py-1">{row.value(run)}</td>
                ))}
              </tr>
            ))}
            {verdictKeys.map((key) => (
              <tr key={key} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-1 text-left font-normal">Flagged: {humanize(key)}</th>
                {runs.map(({ heading, run }) => (
                  <td key={heading} className="px-3 py-1">{plain(run.flagged_by_verdict[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </details>

      {data.assumptions.length > 0 ? (
        <details className="disclosure card">
          <summary>Assumptions</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
            {data.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

// The replay can take over a minute on a cold, low-CPU host.
const BACKTEST_MAX_RETRIES = 40;
const BACKTEST_RETRY_DELAY_MS = 3_000;

export function LivePanel({ data }: { data: LiveMetrics }) {
  return (
    <section aria-label="Live activity" className="hero-card h-full">
      <h2 className="card-title">Live Activity</h2>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {[
          { label: "Open now", value: data.open_now },
          { label: "Cleared", value: data.cleared },
          { label: "Decisions", value: data.decisions_total },
          { label: "Overrides", value: data.overrides },
        ].map((tile) => (
          <div key={tile.label} className="glass-tile">
            <p className="text-2xl font-medium tabular-nums">{tile.value}</p>
            <p className="text-[13px] text-white/80">{tile.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-white/85">Recorded activity, not proven outcomes.</p>
      <p role="status" className="mt-1 flex items-center gap-1.5 text-[13px] text-white/85">
        <Icon name={data.durable ? "check" : "alert"} />
        {data.durable
          ? `Storage is durable (${data.storage ?? "unknown"}).`
          : `Storage is not durable (${data.storage ?? "unknown"}).`}
      </p>
    </section>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "replay", label: "Replay" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function latestValue(weeks: WeekMetrics[], series: Series) {
  const point = [...seriesPoints(weeks, series)].reverse().find((item) => !item.partial && item.value !== null);
  return point?.value != null ? series.format(point.value) : "n/a";
}

export function ImpactView() {
  const [tab, setTab] = useState<TabId>("overview");
  const live = useQuery({
    queryKey: ["metrics", "live"],
    queryFn: ({ signal }) => fetchLiveMetrics(signal),
    staleTime: 0,
  });
  const weekly = useQuery({ queryKey: ["metrics", "weekly"], queryFn: ({ signal }) => fetchWeekly(signal) });
  const backtest = useQuery({
    queryKey: ["metrics", "backtest"],
    queryFn: ({ signal }) => fetchBacktest(signal),
    retry: (failures, error) => isWakingError(error) && failures < BACKTEST_MAX_RETRIES,
    retryDelay: BACKTEST_RETRY_DELAY_MS,
    enabled: tab === "replay",
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Impact</h1>
        <div role="tablist" aria-label="Impact views" className="flex gap-1 rounded-xl bg-line/70 p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-4 py-1.5 text-sm ${tab === item.id ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <QueryBoundary query={weekly}>
          {({ weeks }) =>
            weeks.length === 0 ? (
              <EmptyNotice>No weekly metrics yet.</EmptyNotice>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  {[OUTCOMES[0]!, OUTCOMES[1]!, GUARDRAILS[0]!, GUARDRAILS[2]!].map((series) => (
                    <Stat key={series.key} label={series.title} value={latestValue(weeks, series)} note="Last full week" />
                  ))}
                </div>
                <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
                  <TrendPanel weeks={weeks} series={OUTCOMES[0]!} height={250} />
                  <QueryBoundary query={live} loading={<LoadingRows rows={3} />}>
                    {(data) => <LivePanel data={data} />}
                  </QueryBoundary>
                </div>
              </div>
            )
          }
        </QueryBoundary>
      ) : null}

      {tab === "trends" ? (
        <QueryBoundary query={weekly}>
          {({ weeks }) =>
            weeks.length === 0 ? (
              <EmptyNotice>No weekly metrics yet.</EmptyNotice>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  {[OUTCOMES[1]!, ...GUARDRAILS.slice(0, 3)].map((series) => (
                    <TrendPanel key={series.key} weeks={weeks} series={series} height={170} />
                  ))}
                </div>
                <p className="px-1 text-[13px] text-ink-2">Dashed lines are partial weeks.</p>
                <DataTable weeks={weeks} />
              </div>
            )
          }
        </QueryBoundary>
      ) : null}

      {tab === "replay" ? (
        <QueryBoundary query={backtest}>{(data) => <BacktestResults data={data} />}</QueryBoundary>
      ) : null}
    </div>
  );
}

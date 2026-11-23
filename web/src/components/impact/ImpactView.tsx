"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { fetchBacktest, fetchWeekly } from "@/lib/api";
import type { Backtest, BacktestValue, WeekMetrics } from "@/lib/contract";
import { formatRate, humanize, toPercentSeries } from "@/lib/domain";
import { Icon } from "@/components/Icon";
import { EmptyNotice, QueryBoundary } from "@/components/QueryStates";
import type { TrendPoint } from "@/components/impact/TrendChart";

const TrendChart = dynamic(() => import("@/components/impact/TrendChart"), {
  ssr: false,
  loading: () => <div className="h-[150px] animate-pulse bg-raised" />,
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
    <figure className="min-w-0 border border-line bg-surface p-3">
      <figcaption className="mb-1 flex items-start justify-between gap-2">
        <span>
          <span className="block font-semibold">{series.title}</span>
          <span className="block text-xs text-ink-2">{series.hint}</span>
        </span>
        <span className="text-right">
          <span className="block text-lg leading-tight font-semibold tabular-nums">
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
    <details className="border border-line bg-surface">
      <summary className="cursor-pointer px-3 py-2 font-medium">Weekly data table</summary>
      <div className="overflow-x-auto">
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
    <div className="border border-line bg-surface p-3">
      <p className="flex items-center gap-1 text-xs font-semibold text-ink-2">
        {flagged ? <Icon name="alert" className="text-critical" /> : null}
        {label}
        {flagged ? <span className="sr-only">(needs attention)</span> : null}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-ink-2">{note}</p>
    </div>
  );
}

const notReported = <span className="text-sm font-normal text-ink-2">Not reported</span>;

function precisionValue(value: BacktestValue | null) {
  if (value === null) return notReported;
  if (typeof value === "number") return formatRate(value);
  return (
    <span className="block text-[13px] font-normal">
      {Object.entries(value).map(([key, rate]) => (
        <span key={key} className="flex justify-between gap-2">
          <span className="text-ink-2">{humanize(key)}</span>
          <span>{formatRate(rate)}</span>
        </span>
      ))}
    </span>
  );
}

export function BacktestResults({ data }: { data: Backtest }) {
  const counts = Object.entries(data.verdictCounts ?? {});
  const totalCount = counts.reduce((sum, [, value]) => sum + value, 0);
  const extras = Object.entries(data.extras);
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat
          label="True bugs that would be delayed"
          value={data.trueBugsDelayed ?? notReported}
          note="Real bugs the check would have advised holding. This is the cost of the tool."
          flagged={(data.trueBugsDelayed ?? 0) > 0}
        />
        <Stat
          label="P1 misses"
          value={data.p1Misses ?? notReported}
          note="P1s given anything other than the fast path. The target is 0."
          flagged={(data.p1Misses ?? 0) > 0}
        />
        <Stat
          label="Precision"
          value={precisionValue(data.precision)}
          note="When it advised holding, how often that was right."
        />
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <div className="border border-line bg-surface p-3">
          <h3 className="mb-1 text-xs font-semibold text-ink-2">Verdicts on past tickets</h3>
          {counts.length === 0 ? <p className="text-ink-2">Not reported</p> : (
            <table className="w-full text-[13px] tabular-nums">
              <tbody>
                {counts.map(([key, value]) => (
                  <tr key={key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-1 text-left font-normal">{humanize(key)}</th>
                    <td className="py-1 text-right">{value}</td>
                    <td className="w-16 py-1 text-right text-ink-2">
                      {totalCount > 0 ? `${((value / totalCount) * 100).toFixed(0)}%` : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {extras.length > 0 ? (
          <div className="border border-line bg-surface p-3">
            <h3 className="mb-1 text-xs font-semibold text-ink-2">Other reported figures</h3>
            <dl className="text-[13px] tabular-nums">
              {extras.map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-line py-1 last:border-b-0">
                  <dt>{humanize(key)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ImpactView() {
  const weekly = useQuery({ queryKey: ["metrics", "weekly"], queryFn: ({ signal }) => fetchWeekly(signal) });
  const backtest = useQuery({ queryKey: ["metrics", "backtest"], queryFn: ({ signal }) => fetchBacktest(signal) });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold">Impact</h1>
        <p className="text-ink-2">Dashed segments are partial weeks and are left out of “last full week”.</p>
      </div>
      <QueryBoundary query={weekly}>
        {({ weeks }) =>
          weeks.length === 0 ? (
            <EmptyNotice>No weekly metrics yet.</EmptyNotice>
          ) : (
            <div className="space-y-4">
              <section aria-labelledby="outcomes" className="space-y-2">
                <h2 id="outcomes" className="text-sm font-semibold">Outcomes</h2>
                <div className="grid gap-2 lg:grid-cols-2">
                  {OUTCOMES.map((series) => (
                    <TrendPanel key={series.key} weeks={weeks} series={series} height={190} />
                  ))}
                </div>
              </section>
              <section aria-labelledby="guardrails" className="space-y-2">
                <h2 id="guardrails" className="text-sm font-semibold">Guardrails</h2>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {GUARDRAILS.map((series) => (
                    <TrendPanel key={series.key} weeks={weeks} series={series} />
                  ))}
                </div>
              </section>
              <DataTable weeks={weeks} />
            </div>
          )
        }
      </QueryBoundary>
      <section aria-labelledby="backtest" className="space-y-2">
        <div>
          <h2 id="backtest" className="text-sm font-semibold">Backtest</h2>
          <p className="text-ink-2">The check replayed on past tickets. It estimates what would have happened and is not a live result.</p>
        </div>
        <QueryBoundary query={backtest}>{(data) => <BacktestResults data={data} />}</QueryBoundary>
      </section>
    </div>
  );
}

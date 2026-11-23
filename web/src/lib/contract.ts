/**
 * Every backend response and request shape lives here so the frontend can be
 * reconciled against the API in one place.
 */
import { z } from "zod";

const nullableString = z.string().nullish().transform((value) => value ?? null);
const nullableNumber = z.number().nullish().transform((value) => value ?? null);

export const VERDICTS = [
  "likely_known_issue",
  "try_l1_fix",
  "needs_info",
  "ready_to_escalate",
] as const;
export const verdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof verdictSchema>;

export const confidenceBandSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;

export const DECISION_ACTIONS = ["escalated", "resolved_at_l1", "requested_info"] as const;
export const decisionActionSchema = z.enum(DECISION_ACTIONS);
export type DecisionAction = z.infer<typeof decisionActionSchema>;

export const healthSchema = z.looseObject({});

export const ticketSummarySchema = z.looseObject({
  ticket_id: z.string(),
  created_at: z.string(),
  channel: nullableString,
  client_name: nullableString,
  client_tier: nullableString,
  category: nullableString,
  priority: z.string().transform((value) => value.trim().toUpperCase()),
  description: z.string().nullish().transform((value) => value ?? ""),
  assigned_agent: nullableString,
  status: z.string(),
  escalated_to_eng: z.boolean(),
});
export type TicketSummary = z.infer<typeof ticketSummarySchema>;

export const ticketListSchema = z.object({
  items: z.array(ticketSummarySchema),
  total: z.number().int().nonnegative(),
});
export type TicketList = z.infer<typeof ticketListSchema>;

/** The contract does not enumerate detail-only fields, so extras are retained. */
export const ticketSchema = ticketSummarySchema;
export type Ticket = z.infer<typeof ticketSchema>;

export const checklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const similarTicketSchema = z.object({
  ticket_id: z.string(),
  description: z.string().nullish().transform((value) => value ?? ""),
  category: nullableString,
  eng_outcome: nullableString,
  similarity: z.number(),
  closed_at: nullableString,
});
export type SimilarTicket = z.infer<typeof similarTicketSchema>;

export const precheckResponseSchema = z.object({
  ticket_id: z.string(),
  verdict: verdictSchema,
  confidence_band: confidenceBandSchema,
  reasons: z.array(z.string()),
  checklist: z.array(checklistItemSchema),
  similar: z.array(similarTicketSchema),
  suggested_action: z.string().nullish().transform((value) => value ?? ""),
  override_allowed: z.literal(true),
});
export type PrecheckResponse = z.infer<typeof precheckResponseSchema>;

export interface PrecheckRequest {
  evidence: Record<string, boolean>;
  note?: string;
}

export interface DecisionRequest {
  action: DecisionAction;
  /** Null only when the check could not be loaded, so no verdict was shown. */
  verdict_shown: Verdict | null;
  override_reason?: string;
  agent: string;
}

export const decisionResponseSchema = z.looseObject({});

export const weekSchema = z.object({
  week_start: z.string(),
  partial: z.boolean(),
  arrivals: nullableNumber,
  closures: nullableNumber,
  net_flow: nullableNumber,
  avg_open_7d: nullableNumber,
  avoidable_escalation_share: nullableNumber,
  reopen_rate: nullableNumber,
  p1p2_median_close_h: nullableNumber,
  csat_avg: nullableNumber,
  csat_response_rate: nullableNumber,
});
export type WeekMetrics = z.infer<typeof weekSchema>;

export const weeklyMetricsSchema = z.object({ weeks: z.array(weekSchema) });
export type WeeklyMetrics = z.infer<typeof weeklyMetricsSchema>;

/** Scalar or per-verdict value, as the backtest payload shape is not fixed. */
export type BacktestValue = number | Record<string, number>;

export interface Backtest {
  verdictCounts: Record<string, number> | null;
  precision: BacktestValue | null;
  trueBugsDelayed: number | null;
  p1Misses: number | null;
  /** Numeric fields the UI has no dedicated slot for, shown rather than dropped. */
  extras: Record<string, number>;
}

const BACKTEST_ALIASES = {
  verdictCounts: ["verdict_counts", "verdicts", "counts", "counts_by_verdict"],
  precision: ["precision", "known_issue_precision", "hold_precision", "precision_by_verdict"],
  trueBugsDelayed: ["true_bugs_delayed", "true_bugs_held", "bugs_delayed", "delayed_true_bugs"],
  p1Misses: ["p1_misses", "p1_missed", "p1_miss_count", "p1_held"],
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function numericRecord(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value).filter((entry): entry is [string, number] =>
    isFiniteNumber(entry[1]),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function countFrom(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;
  if (isRecord(value) && isFiniteNumber(value.count)) return value.count;
  return null;
}

function firstKey(source: Record<string, unknown>, keys: readonly string[]) {
  return keys.find((key) => source[key] !== undefined && source[key] !== null);
}

/**
 * Tolerant by design: missing fields stay null so the UI reports them as
 * "not reported" and never implies a zero the backend did not state.
 */
export const backtestSchema = z.unknown().transform((input, ctx): Backtest => {
  if (!isRecord(input)) {
    ctx.addIssue({ code: "custom", message: "Backtest payload must be an object" });
    return z.NEVER;
  }
  const source = isRecord(input.backtest) ? input.backtest : input;
  const consumed = new Set<string>();
  const take = (keys: readonly string[]) => {
    const key = firstKey(source, keys);
    if (key === undefined) return undefined;
    consumed.add(key);
    return source[key];
  };

  const rawPrecision = take(BACKTEST_ALIASES.precision);
  const backtest: Backtest = {
    verdictCounts: numericRecord(take(BACKTEST_ALIASES.verdictCounts)),
    precision: isFiniteNumber(rawPrecision) ? rawPrecision : numericRecord(rawPrecision),
    trueBugsDelayed: countFrom(take(BACKTEST_ALIASES.trueBugsDelayed)),
    p1Misses: countFrom(take(BACKTEST_ALIASES.p1Misses)),
    extras: {},
  };
  for (const [key, value] of Object.entries(source)) {
    if (!consumed.has(key) && isFiniteNumber(value)) backtest.extras[key] = value;
  }
  return backtest;
});

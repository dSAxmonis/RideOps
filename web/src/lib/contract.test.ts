import { describe, expect, it } from "vitest";
import {
  backtestSchema,
  precheckResponseSchema,
  ticketListSchema,
  weeklyMetricsSchema,
} from "@/lib/contract";

const ticket = {
  ticket_id: "T-1",
  created_at: "2026-01-05T08:00:00Z",
  channel: "email",
  client_name: "Example Client",
  client_tier: "gold",
  category: "routing",
  priority: "p2",
  description: "Sample text",
  assigned_agent: null,
  status: "open",
  escalated_to_eng: false,
};

describe("contract", () => {
  it("parses ticket lists, normalises priority and keeps extra fields", () => {
    const parsed = ticketListSchema.parse({ items: [{ ...ticket, extra: 1 }], total: 1 });
    expect(parsed.items[0]?.priority).toBe("P2");
    expect(parsed.items[0]).toHaveProperty("extra", 1);
  });

  it("rejects an unknown verdict rather than guessing", () => {
    const result = precheckResponseSchema.safeParse({
      ticket_id: "T-1",
      verdict: "hold",
      confidence_band: "low",
      reasons: [],
      checklist: [],
      similar: [],
      suggested_action: "",
      override_allowed: true,
    });
    expect(result.success).toBe(false);
  });

  it("allows null metrics on a week", () => {
    const parsed = weeklyMetricsSchema.parse({
      weeks: [{ week_start: "2026-01-05", partial: true, csat_avg: null }],
    });
    expect(parsed.weeks[0]?.avg_open_7d).toBeNull();
  });

  it("reads backtest aliases and retains unknown numeric fields", () => {
    expect(
      backtestSchema.parse({
        verdicts: { try_l1_fix: 4 },
        precision: 0.8,
        bugs_delayed: { count: 3 },
        p1_misses: 0,
        sample_size: 90,
      }),
    ).toEqual({
      verdictCounts: { try_l1_fix: 4 },
      precision: 0.8,
      trueBugsDelayed: 3,
      p1Misses: 0,
      extras: { sample_size: 90 },
    });
  });

  it("leaves missing backtest fields null instead of zero", () => {
    expect(backtestSchema.parse({})).toEqual({
      verdictCounts: null,
      precision: null,
      trueBugsDelayed: null,
      p1Misses: null,
      extras: {},
    });
  });
});

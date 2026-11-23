import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BacktestResults } from "@/components/impact/ImpactView";
import { toChartRows } from "@/components/impact/TrendChart";

describe("BacktestResults", () => {
  it("states missing figures as not reported instead of zero", () => {
    render(<BacktestResults data={{ verdictCounts: null, precision: null, trueBugsDelayed: null, p1Misses: null, extras: {} }} />);
    expect(screen.getAllByText("Not reported").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("surfaces true bugs that would be delayed", () => {
    render(<BacktestResults data={{ verdictCounts: { try_l1_fix: 3 }, precision: 0.75, trueBugsDelayed: 7, p1Misses: 0, extras: {} }} />);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });
});

describe("toChartRows", () => {
  it("draws only the partial week on the dashed series, joined to the last full week", () => {
    const rows = toChartRows([
      { week: "2026-01-05", partial: false, value: 1 },
      { week: "2026-01-12", partial: false, value: 2 },
      { week: "2026-01-19", partial: true, value: 3 },
    ]);
    expect(rows.map((row) => row.full)).toEqual([1, 2, null]);
    expect(rows.map((row) => row.bridge)).toEqual([null, 2, 3]);
  });
});

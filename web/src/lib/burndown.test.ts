import { describe, expect, it } from "vitest";
import { applyState, availableActions, awaitingNextAction, sortBurndown } from "@/lib/burndown";
import type { Burndown, BurndownItem } from "@/lib/contract";

const item = (ticket_id: string, overrides: Partial<BurndownItem> = {}): BurndownItem => ({
  ticket_id,
  priority: "P3",
  client_name: "Example",
  category: "routing",
  description: "Sample",
  assigned_agent: "Agent",
  status: "Open",
  eng_outcome: null,
  age_hours: 10,
  handoffs: 0,
  reopen_count: 0,
  lane: "get_info",
  owner: "L1",
  next_action: "Ask",
  status_mismatch: false,
  state: "open",
  last_action_at: null,
  ...overrides,
});

const data: Burndown = {
  snapshot_at: null,
  open_at_snapshot: 2,
  open_now: 2,
  cleared: 0,
  lanes: [{ lane: "get_info", label: "Get info", count: 2, owner: "L1", next_action: "Ask" }],
  items: [item("a"), item("b", { eng_outcome: "Fixed" })],
};

describe("burn-down state", () => {
  it("updates counts when clearing and restores them on reopen", () => {
    const cleared = applyState(data, "a", "cleared", "now");
    expect([cleared.open_now, cleared.cleared, cleared.lanes[0]?.count]).toEqual([1, 1, 1]);
    const back = applyState(cleared, "a", "open", null);
    expect(back).toEqual(data);
  });

  it("does not change counts for waiting on client", () => {
    const waiting = applyState(data, "a", "waiting_client", "now");
    expect([waiting.open_now, waiting.cleared]).toEqual([2, 0]);
    expect(waiting.items[0]?.state).toBe("waiting_client");
  });

  it("sorts by priority and age with cleared rows last", () => {
    const sorted = sortBurndown([
      item("low", { priority: "P4", age_hours: 90 }),
      item("new", { priority: "P1", age_hours: 1 }),
      item("old", { priority: "P1", age_hours: 9 }),
      item("done", { priority: "P1", age_hours: 99, state: "cleared" }),
    ]);
    expect(sorted.map((row) => row.ticket_id)).toEqual(["old", "new", "low", "done"]);
  });

  it("counts open tickets with an engineering verdict", () => {
    expect(awaitingNextAction([item("a", { eng_outcome: "Fixed" }), item("b"), item("c", { eng_outcome: "Fixed", state: "cleared" })])).toBe(1);
  });

  it("offers only actions that change the state", () => {
    expect(availableActions("open")).toEqual(["cleared", "waiting_client"]);
    expect(availableActions("waiting_client")).toEqual(["cleared", "reopened"]);
    expect(availableActions("cleared")).toEqual(["reopened"]);
  });
});

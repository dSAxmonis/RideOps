import type { BacklogAction, Burndown, BurndownItem } from "@/lib/contract";
import { priorityRank } from "@/lib/domain";

export const isCleared = (item: Pick<BurndownItem, "state">) => item.state === "cleared";

/** Cleared rows stay visible, last, so they can be reopened. */
export function sortBurndown(items: readonly BurndownItem[]) {
  return [...items].sort(
    (a, b) =>
      Number(isCleared(a)) - Number(isCleared(b)) ||
      priorityRank(a.priority) - priorityRank(b.priority) ||
      b.age_hours - a.age_hours ||
      a.ticket_id.localeCompare(b.ticket_id),
  );
}

export const awaitingNextAction = (items: readonly BurndownItem[]) =>
  items.filter((item) => !isCleared(item) && item.eng_outcome !== null).length;

export function availableActions(state: string): BacklogAction[] {
  if (state === "cleared") return ["reopened"];
  if (state === "waiting_client") return ["cleared", "reopened"];
  return ["cleared", "waiting_client"];
}

/** Moves one row to a new state and keeps every count consistent. */
export function applyState(
  data: Burndown,
  ticketId: string,
  state: string,
  lastActionAt: string | null,
): Burndown {
  const item = data.items.find((row) => row.ticket_id === ticketId);
  if (!item) return data;
  const delta = Number(state === "cleared") - Number(isCleared(item));
  return {
    ...data,
    open_now: data.open_now - delta,
    cleared: data.cleared + delta,
    lanes: data.lanes.map((lane) =>
      lane.lane === item.lane ? { ...lane, count: lane.count - delta } : lane,
    ),
    items: data.items.map((row) =>
      row.ticket_id === ticketId ? { ...row, state, last_action_at: lastActionAt } : row,
    ),
  };
}

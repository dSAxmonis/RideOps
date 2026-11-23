export function PriorityBadge({ priority }: { priority: string }) {
  const style =
    priority === "P1"
      ? "bg-critical-soft text-critical-text"
      : priority === "P2"
        ? "bg-serious-soft text-serious-text"
        : "bg-raised text-ink-2";
  return (
    <span className={`inline-block w-9 rounded-md py-0.5 text-center text-xs font-semibold tabular-nums ${style}`}>
      {priority}
    </span>
  );
}

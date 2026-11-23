const PATHS = {
  check: "M3 8.5 6.5 12 13 4.5",
  alert: "M8 2.5 14.5 13.5h-13L8 2.5ZM8 6.5v3.5M8 12v.01",
  info: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.5V11M8 5v.01",
  bolt: "M9 1.5 3 9h4l-1 5.5L13 7H8.5L9 1.5Z",
  wrench: "M10.5 2a3.5 3.5 0 0 0-3.3 4.6L2 11.8 4.2 14l5.2-5.2A3.5 3.5 0 0 0 14 5.5l-2.2 2.2-2-.5-.5-2L11.5 3a3.5 3.5 0 0 0-1-.1Z",
  arrow: "M5 11 11 5M6 5h5v5",
  folder: "M1.5 4.5a1 1 0 0 1 1-1h3.7l1.5 1.5h5.8a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8Z",
  moon: "M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z",
  more: "M8 3.5v.01M8 8v.01M8 12.5v.01",
  route: "M4 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5.5 12H10a2 2 0 0 0 0-4H6a2 2 0 0 1 0-4h4.5",
  search: "M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM14.5 14.5 11 11",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

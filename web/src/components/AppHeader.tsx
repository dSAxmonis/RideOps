"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useAgentName } from "@/lib/useAgentName";

function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  if (next === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Theme simply will not persist when storage is unavailable.
  }
}

function AgentChip() {
  const [agent] = useAgentName();
  const name = agent.trim();
  return (
    <div className="hidden items-center gap-2.5 sm:flex">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-ink"
      >
        {(name[0] ?? "L").toUpperCase()}
      </span>
      <span className="max-w-28 leading-tight">
        <span className="block truncate font-medium">{name || "L1 Agent"}</span>
        <span className="block text-xs text-ink-2">Support</span>
      </span>
    </div>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const links = [
    { href: "/burndown", label: "Burn-down", active: pathname === "/" || pathname.startsWith("/burndown") },
    { href: "/queue", label: "Queue", active: pathname.startsWith("/queue") || pathname.startsWith("/tickets") },
    { href: "/impact", label: "Impact", active: pathname.startsWith("/impact") },
  ];

  return (
    <header>
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/burndown" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <Icon name="route" />
          </span>
          <span>
            Ride<span className="text-accent">Ops</span>
          </span>
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full justify-center gap-1 md:order-none md:w-auto">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={`rounded-xl px-4 py-2 text-[15px] ${
                link.active ? "bg-line/70 font-medium text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Toggle dark mode"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-ink hover:bg-surface"
          >
            <Icon name="moon" />
          </button>
          <AgentChip />
        </div>
      </div>
    </header>
  );
}

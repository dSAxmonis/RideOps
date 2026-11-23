"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";

export interface SelectOption {
  value: string;
  label: string;
}

/** A styled single-select. An empty value means "no filter". */
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [alignRight, setAlignRight] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  const filtered = value !== "";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const show = () => {
    const box = root.current?.getBoundingClientRect();
    setAlignRight(Boolean(box && box.left > window.innerWidth / 2));
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(options.length - 1, index));
    setActive(next);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    const actions: Record<string, () => void> = {
      ArrowDown: () => moveTo(active + 1),
      ArrowUp: () => moveTo(active - 1),
      Home: () => moveTo(0),
      End: () => moveTo(options.length - 1),
      Enter: () => choose(active),
      " ": () => choose(active),
      Escape: () => setOpen(false),
    };
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`flex h-10 max-w-56 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition ${
          open || filtered
            ? "border-accent bg-serious-soft text-serious-text"
            : "border-line bg-surface text-ink hover:border-accent hover:bg-serious-soft"
        }`}
      >
        <span className="truncate">{options[selectedIndex]?.label ?? label}</span>
        <Icon name="chevron" className={`text-accent transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={`absolute z-30 mt-1.5 max-h-72 w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-full overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          {options.map((option, index) => {
            const selected = index === selectedIndex;
            return (
              <li
                key={option.value || "all"}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-2 text-sm ${
                  index === active ? "bg-serious-soft text-serious-text" : "text-ink"
                } ${selected ? "font-semibold" : ""}`}
              >
                <span className="truncate">{option.label}</span>
                {selected ? <Icon name="check" className="text-accent" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

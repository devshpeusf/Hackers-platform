"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "@/lib/clsx";

export type SchoolSource = "catalog" | "manual";

/**
 * What a committed school choice carries. `source` is the whole point: a
 * "catalog" pick is guaranteed to match MLH's spelling exactly, a "manual" one
 * is free text an organizer should normalise before we report to MLH.
 *
 * When the applications table lands, this wants two columns, not one — the
 * name and the source. Adding the flag later means backfilling guesses.
 */
export type SchoolSelection = { name: string; source: SchoolSource };

type SchoolPickerProps = {
  defaultValue?: string;
  /** Fires when a school is committed, and says whether it came off MLH's list. */
  onChange?: (value: string, source: SchoolSource) => void;
  /**
   * Whether someone whose school isn't on MLH's list may submit what they
   * typed.
   *
   * PLAT-15 says "no typing whatever they want", but MLH's catalogue still
   * misses schools and Knight Hacks deliberately allows manual entry. Left as
   * a prop so the team can flip it and compare rather than argue in the
   * abstract. Whichever wins, the API route is unaffected.
   */
  allowManualEntry?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
};

/** Long enough to stop firing per keystroke, short enough to feel instant. */
const DEBOUNCE_MS = 140;

const FIELD =
  "w-full bg-surface-bg/60 border px-[14px] py-3 text-[13px] text-text-primary placeholder:text-text-dim outline-none transition-colors";

/** Bolds the typed run inside a result. Plain substring match — a miss just renders unstyled. */
function Highlight({ name, query }: { name: string; query: string }) {
  const at = query ? name.toLowerCase().indexOf(query.toLowerCase().trim()) : -1;
  if (at < 0) return <>{name}</>;
  const end = at + query.trim().length;
  return (
    <>
      {name.slice(0, at)}
      <strong className="font-bold">{name.slice(at, end)}</strong>
      {name.slice(end)}
    </>
  );
}

export default function SchoolPicker({
  defaultValue = "",
  onChange,
  allowManualEntry = false,
  id,
  placeholder = "Start typing your school…",
  className,
}: SchoolPickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-listbox`;

  const [query, setQuery] = useState(defaultValue);
  const [matches, setMatches] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  /** The value actually committed — empty until a row is chosen. */
  const [committed, setCommitted] = useState(defaultValue);

  const boxRef = useRef<HTMLDivElement>(null);

  /* Fetch on a debounce. The AbortController matters: without it a slow
     response for "us" can land after "usf" and overwrite fresher results. */
  useEffect(() => {
    const q = query.trim();
    if (!q || q === committed) {
      setMatches([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/schools?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: { matches: { name: string }[] } = await res.json();
        setMatches(data.matches.map((m) => m.name));
        setActive(0);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setMatches([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, committed]);

  /* Close when focus leaves the whole control — not on input blur, which
     would fire before a click on an option registers. */
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function commit(value: string, source: SchoolSource) {
    setQuery(value);
    setCommitted(value);
    setOpen(false);
    setMatches([]);
    onChange?.(value, source);
  }

  const manualRowVisible =
    allowManualEntry && query.trim().length > 1 && !matches.includes(query.trim());
  const rowCount = matches.length + (manualRowVisible ? 1 : 0);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return setOpen(false);
    if (!open || rowCount === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rowCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + rowCount) % rowCount);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < matches.length) commit(matches[active], "catalog");
      else if (manualRowVisible) commit(query.trim(), "manual");
    }
  }

  const unresolved = !allowManualEntry && committed === "" && query.trim().length > 1;

  return (
    <div ref={boxRef} className={clsx("relative", className)}>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rowCount ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={clsx(
          FIELD,
          open || committed
            ? "border-accent-pink-light/55 shadow-[0_0_0_3px_rgba(255,143,214,0.1)]"
            : "border-[rgba(244,241,251,0.14)]",
        )}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCommitted("");
        }}
        onFocus={() => matches.length && setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && rowCount > 0 && (
        <ul
          id={listId}
          role="listbox"
          // Keep focus in the input so blur never races the click.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1.5 max-h-[264px] w-full overflow-y-auto bg-surface-bg shadow-[0_-2px_0_0_var(--color-accent-pink-light),0_2px_0_0_var(--color-accent-pink-light),-2px_0_0_0_var(--color-accent-pink-light),2px_0_0_0_var(--color-accent-pink-light)]"
        >
          {matches.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(name, "catalog")}
              className={clsx(
                "cursor-pointer px-3.5 py-2.5 text-[13px]",
                i > 0 && "border-t border-text-primary/6",
                i === active
                  ? "bg-accent-pink-light/10 text-accent-pink-light"
                  : "text-text-secondary",
              )}
            >
              <Highlight name={name} query={query} />
            </li>
          ))}

          {manualRowVisible && (
            <li
              id={`${listId}-${matches.length}`}
              role="option"
              aria-selected={active === matches.length}
              onMouseEnter={() => setActive(matches.length)}
              onClick={() => commit(query.trim(), "manual")}
              className={clsx(
                "cursor-pointer px-3.5 py-2.5 text-xs italic",
                matches.length > 0 && "border-t border-text-primary/6",
                active === matches.length
                  ? "bg-accent-amber/10 text-accent-amber"
                  : "text-text-dim",
              )}
            >
              My school isn&apos;t listed — use &ldquo;{query.trim()}&rdquo;
            </li>
          )}
        </ul>
      )}

      {loading && !open && (
        <div className="absolute right-3.5 top-3.5 text-[11px] text-text-dim">…</div>
      )}

      {unresolved && !open && (
        <div className="mt-2 text-[11px] text-accent-amber">
          Pick your school from the list to continue.
        </div>
      )}
    </div>
  );
}

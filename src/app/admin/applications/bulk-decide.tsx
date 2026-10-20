"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { decideApplications } from "./actions";
import { DECISIONS } from "@/lib/decisions";
import { STATUS_STYLE } from "./status";
import { BULK_FORM_ID } from "./bulk-form";

/**
 * Bulk deciding on the applications list.
 *
 * The row checkboxes are plain server-rendered inputs joined to this form by
 * their `form` attribute, so the DOM is the source of truth for what's
 * selected — the server sends no extra data to the browser, and the existing
 * rows don't need to become client components. This file only counts them,
 * offers select-all, and shows the action bar.
 */

const ROW_SELECTOR = `input[type="checkbox"][name="ids"][form="${BULK_FORM_ID}"]`;

function rowBoxes(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(ROW_SELECTOR)).filter((b) => !b.disabled);
}

/** Re-counts whenever any row checkbox changes. */
function useSelection() {
  const [selected, setSelected] = useState(0);
  const [total, setTotal] = useState(0);

  const recount = useCallback(() => {
    const boxes = rowBoxes();
    setTotal(boxes.length);
    setSelected(boxes.filter((b) => b.checked).length);
  }, []);

  useEffect(() => {
    recount();
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.matches(ROW_SELECTOR)) recount();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [recount]);

  return { selected, total, recount };
}

function setAll(checked: boolean) {
  for (const box of rowBoxes()) box.checked = checked;
  document.dispatchEvent(new Event("bulk-selection"));
}

/**
 * Clears the selection after every navigation — including the redirect back
 * from a bulk decision. Unchecked inputs React kept from the previous render
 * would otherwise still look selected, inviting a second accidental submit.
 */
function useClearOnNavigation(recount: () => void) {
  const params = useSearchParams().toString();
  useEffect(() => {
    setAll(false);
    recount();
  }, [params, recount]);
}

/** The checkbox in the table header: selects every row in the current view. */
export function SelectAll() {
  const { selected, total, recount } = useSelection();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onBulk = () => recount();
    document.addEventListener("bulk-selection", onBulk);
    return () => document.removeEventListener("bulk-selection", onBulk);
  }, [recount]);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && selected < total;
  }, [selected, total]);

  return (
    <input
      ref={ref}
      id="bulk-select-all"
      type="checkbox"
      checked={total > 0 && selected === total}
      disabled={total === 0}
      onChange={(e) => setAll(e.target.checked)}
      aria-label={`Select all ${total} applicants in this view`}
      title="Select everyone in this view"
      className="h-4 w-4 cursor-pointer accent-[var(--color-accent-pink)]"
    />
  );
}

function DecisionButton({ decision, count }: { decision: (typeof DECISIONS)[number]; count: number }) {
  const { pending } = useFormStatus();
  const style = STATUS_STYLE[decision];
  const verb = { ACCEPTED: "ACCEPT", WAITLISTED: "WAITLIST", REJECTED: "REJECT" }[decision];
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={pending}
      className="border-2 bg-surface-bg px-3.5 py-2 font-body text-[11px] font-bold tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
      style={{ color: style.color, borderColor: style.color }}
    >
      {verb} {count}
    </button>
  );
}

function SavingNote() {
  const { pending } = useFormStatus();
  return pending ? <span className="text-[11px] text-text-muted">Saving&hellip;</span> : null;
}

/** The bar that appears at the bottom of the screen once anything is selected. */
export function BulkDecideBar({ returnTo }: { returnTo: string }) {
  const { selected, recount } = useSelection();
  useClearOnNavigation(recount);

  useEffect(() => {
    const onBulk = () => recount();
    document.addEventListener("bulk-selection", onBulk);
    return () => document.removeEventListener("bulk-selection", onBulk);
  }, [recount]);

  return (
    // The form always exists, even with nothing selected: the row checkboxes
    // point at it by id, so it has to be in the page for them to belong to it.
    <form id={BULK_FORM_ID} action={decideApplications}>
      <input type="hidden" name="returnTo" value={returnTo} />
      {selected > 0 && (
        <div
          role="region"
          aria-label="Bulk decision"
          className="fixed inset-x-0 bottom-0 z-30 hidden justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:flex"
        >
          <div className="pixel-card flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="mr-1 text-[13px] text-text-primary">
              <strong className="tabular-nums">{selected}</strong> selected
            </span>
            {DECISIONS.map((d) => (
              <DecisionButton key={d} decision={d} count={selected} />
            ))}
            <SavingNote />
            <button
              type="button"
              onClick={() => setAll(false)}
              className="ml-1 text-[11px] text-text-muted underline-offset-4 hover:text-text-primary hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

"use client";

import { useActionState, useRef, useState } from "react";
import clsx from "@/lib/clsx";
import type { ScheduleRow } from "@/lib/event-schedule";
import { saveEventSchedule, type SaveScheduleState } from "./actions";

type EditableRow = ScheduleRow & { key: number };

/**
 * The run-of-show editor: one line per row, in display order. Rows are plain
 * form fields (time / label / highlighted, one of each per row), so the save
 * action reads exactly what's on screen — nobody edits JSON.
 */
export default function ScheduleForm({ initial }: { initial: ScheduleRow[] }) {
  const [state, action, pending] = useActionState<SaveScheduleState, FormData>(saveEventSchedule, { status: "idle" });
  const nextKey = useRef(initial.length);
  const [rows, setRows] = useState<EditableRow[]>(() =>
    initial.length ? initial.map((r, i) => ({ ...r, key: i })) : [{ time: "", label: "", highlighted: false, key: 0 }],
  );

  const update = (key: number, patch: Partial<ScheduleRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const move = (index: number, by: -1 | 1) =>
    setRows((rs) => {
      const to = index + by;
      if (to < 0 || to >= rs.length) return rs;
      const copy = [...rs];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });
  const add = () => setRows((rs) => [...rs, { time: "", label: "", highlighted: false, key: nextKey.current++ }]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-[11px] leading-[1.6] text-text-dim">
        Rows show on /schedule in this order. Times are plain text (&ldquo;9:00 AM&rdquo;, &ldquo;Sat 9:00 AM&rdquo;).
        Highlight the moments that matter, like hacking starting or the submission deadline.
      </p>

      <ol className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <li key={row.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input
              id={`schedule-time-${row.key}`}
              name="time"
              value={row.time}
              onChange={(e) => update(row.key, { time: e.target.value })}
              placeholder="9:00 AM"
              aria-label={`Row ${i + 1} time`}
              className="field w-[7.5rem] shrink-0 px-3 py-2 font-body text-[13px] text-text-primary placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink"
            />
            <input
              id={`schedule-label-${row.key}`}
              name="label"
              value={row.label}
              onChange={(e) => update(row.key, { label: e.target.value })}
              placeholder="Opening ceremony"
              aria-label={`Row ${i + 1} label`}
              className="field min-w-0 flex-1 basis-48 px-3 py-2 font-body text-[13px] text-text-primary placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink"
            />
            {/* Hidden rather than a checkbox: an unchecked checkbox isn't
                submitted at all, which would misalign the rows. */}
            <input type="hidden" name="highlighted" value={row.highlighted ? "true" : "false"} />
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                label={row.highlighted ? `Un-highlight row ${i + 1}` : `Highlight row ${i + 1}`}
                pressed={row.highlighted}
                onClick={() => update(row.key, { highlighted: !row.highlighted })}
                className={row.highlighted ? "text-accent-teal" : "text-text-dim"}
              >
                ★
              </IconButton>
              <IconButton label={`Move row ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </IconButton>
              <IconButton label={`Move row ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                ↓
              </IconButton>
              <IconButton label={`Remove row ${i + 1}`} onClick={() => remove(row.key)} className="hover:text-terminal-red">
                ✕
              </IconButton>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={add} className="text-[12px] font-bold text-accent-teal underline-offset-4 hover:underline">
          + Add row
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="pixel-btn-solid px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
        >
          {pending ? "SAVING…" : "SAVE SCHEDULE"}
        </button>
        <p role="status" aria-live="polite" className="text-[12px] text-text-muted">
          {state.status === "saved" && (
            <span className="text-accent-teal">
              {state.count === 0 ? "Saved. The schedule is empty, so /schedule shows “in progress”." : `Saved ${state.count} rows. /schedule is updated.`}
            </span>
          )}
          {state.status === "invalid" && <span className="text-terminal-red">Nothing saved. {state.error}</span>}
          {state.status === "denied" && <span className="text-terminal-red">Only organizers can edit the schedule.</span>}
          {state.status === "error" && <span className="text-terminal-red">Couldn&apos;t save. Please try again.</span>}
        </p>
      </div>
    </form>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={clsx(
        "h-8 w-8 border border-text-primary/12 text-[13px] text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30",
        className,
      )}
    >
      {children}
    </button>
  );
}

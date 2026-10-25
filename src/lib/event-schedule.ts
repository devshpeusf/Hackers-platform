/**
 * The run of show, stored as JSON on the Event row (Event.schedule).
 * Shared by /schedule (reading) and /admin/event (editing). Plain functions,
 * no database, so they're testable.
 *
 * Decision (schedule ticket): stored on the Event record rather than
 * hardcoded. It reuses the guide's Event fields and /admin/event editor, so
 * it cost about the same, and a slip on the day can be fixed without a
 * deploy. The portal schedule is the single source; the full guide links to
 * it rather than copying it. Discord announces live changes.
 */

export type ScheduleRow = {
  /** Free text, e.g. "9:00 AM" or "Sat 9:00 AM" — not a Date, so a slip is one edit. */
  time: string;
  label: string;
  /** Drawn in the accent colour — for the moments that matter (hacking starts, deadline). */
  highlighted: boolean;
};

export const SCHEDULE_LIMITS = { rows: 40, time: 24, label: 120 } as const;

/**
 * Reads the stored JSON defensively. Someone can edit it by hand in Supabase,
 * so a typo must never break the page: anything that isn't a valid row is
 * skipped, and a value that isn't a list at all reads as an empty schedule.
 */
export function parseSchedule(value: unknown): ScheduleRow[] {
  if (!Array.isArray(value)) return [];
  const rows: ScheduleRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const { time, label, highlighted } = raw as Record<string, unknown>;
    if (typeof time !== "string" || typeof label !== "string") continue;
    if (!time.trim() || !label.trim()) continue;
    rows.push({
      time: time.trim().slice(0, SCHEDULE_LIMITS.time),
      label: label.trim().slice(0, SCHEDULE_LIMITS.label),
      highlighted: highlighted === true,
    });
    if (rows.length === SCHEDULE_LIMITS.rows) break;
  }
  return rows;
}

/**
 * Reads the /admin/event schedule form: parallel `time`, `label` and
 * `highlighted` fields, one of each per row, in display order. A fully empty
 * row is dropped (an unused blank line); a half-filled one is an error.
 */
export function parseScheduleForm(
  formData: FormData,
): { ok: true; rows: ScheduleRow[] } | { ok: false; error: string } {
  const times = formData.getAll("time");
  const labels = formData.getAll("label");
  const highlights = formData.getAll("highlighted");
  if (times.length !== labels.length || times.length !== highlights.length) {
    return { ok: false, error: "The form was incomplete. Reload the page and try again." };
  }

  const rows: ScheduleRow[] = [];
  for (let i = 0; i < times.length; i++) {
    const time = typeof times[i] === "string" ? (times[i] as string).trim() : "";
    const label = typeof labels[i] === "string" ? (labels[i] as string).trim() : "";
    if (!time && !label) continue;
    if (!time || !label) return { ok: false, error: `Row ${i + 1} needs both a time and a label.` };
    if (time.length > SCHEDULE_LIMITS.time) {
      return { ok: false, error: `Row ${i + 1}: keep the time under ${SCHEDULE_LIMITS.time} characters.` };
    }
    if (label.length > SCHEDULE_LIMITS.label) {
      return { ok: false, error: `Row ${i + 1}: keep the label under ${SCHEDULE_LIMITS.label} characters.` };
    }
    rows.push({ time, label, highlighted: highlights[i] === "true" });
  }
  if (rows.length > SCHEDULE_LIMITS.rows) {
    return { ok: false, error: `Keep it to ${SCHEDULE_LIMITS.rows} rows or fewer.` };
  }
  return { ok: true, rows };
}

"use client";

import { useActionState, useRef, useState } from "react";
import clsx from "@/lib/clsx";
import type { EventLocation } from "@/lib/event-guide";
import { saveEventLocations, type SaveLocationsState } from "./actions";

type EditableLocation = { label: string; place: string; note: string; address: string; key: number };

const blank = (key: number): EditableLocation => ({ label: "", place: "", note: "", address: "", key });

/**
 * The locations editor: one block per place, in display order. The first is
 * the main venue (the dashboard header names it). Plain form fields, so the
 * save action reads exactly what's on screen — nobody edits JSON.
 */
export default function LocationsForm({ initial }: { initial: EventLocation[] }) {
  const [state, action, pending] = useActionState<SaveLocationsState, FormData>(saveEventLocations, { status: "idle" });
  const nextKey = useRef(initial.length);
  const [rows, setRows] = useState<EditableLocation[]>(() =>
    initial.length
      ? initial.map((l, i) => ({ label: l.label, place: l.place, note: l.note ?? "", address: l.address ?? "", key: i }))
      : [blank(0)],
  );

  const update = (key: number, patch: Partial<EditableLocation>) =>
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

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-[11px] leading-[1.6] text-text-dim">
        One entry per place, shown on the guide in this order. Put the main venue first: the dashboard names it. An
        address gives that place its own Maps link.
      </p>

      <ol className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={row.key} className="field flex flex-col gap-2.5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-pixel text-[8px] tracking-widest text-text-muted">
                {i === 0 ? "MAIN VENUE" : `LOCATION ${i + 1}`}
              </span>
              <div className="flex items-center gap-1">
                <IconButton label={`Move location ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0}>↑</IconButton>
                <IconButton label={`Move location ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</IconButton>
                <IconButton label={`Remove location ${i + 1}`} onClick={() => remove(row.key)} className="hover:text-terminal-red">✕</IconButton>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Field id={`loc-label-${row.key}`} name="locLabel" label="Label" placeholder="Main venue" value={row.label} onChange={(v) => update(row.key, { label: v })} />
              <Field id={`loc-place-${row.key}`} name="locPlace" label="Place" placeholder="ENB" value={row.place} onChange={(v) => update(row.key, { place: v })} />
            </div>
            <Field id={`loc-note-${row.key}`} name="locNote" label="Note (optional)" placeholder="Hacking, food and workshops happen here" value={row.note} onChange={(v) => update(row.key, { note: v })} />
            <Field id={`loc-address-${row.key}`} name="locAddress" label="Address (optional)" placeholder="4202 E Fowler Ave, Tampa, FL" value={row.address} onChange={(v) => update(row.key, { address: v })} />
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, blank(nextKey.current++)])}
        className="self-start text-[12px] font-bold text-accent-teal underline-offset-4 hover:underline"
      >
        + Add location
      </button>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="pixel-btn-solid px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
        >
          {pending ? "SAVING…" : "SAVE LOCATIONS"}
        </button>
        <p role="status" aria-live="polite" className="text-[12px] text-text-muted">
          {state.status === "saved" && (
            <span className="text-accent-teal">
              {state.count === 0 ? "Saved. No locations, so the guide shows the venue as TBA." : `Saved ${state.count} locations. The guide is updated.`}
            </span>
          )}
          {state.status === "invalid" && <span className="text-terminal-red">Nothing saved. {state.error}</span>}
          {state.status === "denied" && <span className="text-terminal-red">Only organizers can edit locations.</span>}
          {state.status === "error" && <span className="text-terminal-red">Couldn&apos;t save. Please try again.</span>}
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-text-muted">{label}</span>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field w-full bg-surface-bg px-3 py-2 font-body text-[13px] text-text-primary placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink"
      />
    </label>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "h-7 w-7 border border-text-primary/12 text-[12px] text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30",
        className,
      )}
    >
      {children}
    </button>
  );
}

"use client";

import { useActionState } from "react";
import clsx from "@/lib/clsx";
import type { EventGuide } from "@/lib/event-guide";
import { saveEventGuide, type SaveGuideState } from "./actions";

/**
 * The guide editor. Plain inputs, prefilled from the event. An empty field
 * saves as empty and the guide shows "TBA" for it.
 */
export default function GuideForm({ initial }: { initial: EventGuide }) {
  const [state, action, pending] = useActionState<SaveGuideState, FormData>(saveEventGuide, { status: "idle" });
  const errors = state.status === "invalid" ? state.errors : {};

  return (
    <form action={action} className="flex flex-col gap-6">
      <Section title="FULL HACKER GUIDE">
        <Input
          id="hackerGuideUrl"
          label="Link to the guide document"
          hint="The public Notion page. Leave empty until it's ready. /guide shows an 'in progress' notice."
          placeholder="https://your-team.notion.site/hackjam-26-hacker-guide"
          defaultValue={initial.hackerGuideUrl}
          error={errors.hackerGuideUrl}
        />
      </Section>

      <Section title="VENUE & PARKING">
        <Input id="venueName" label="Venue" placeholder="Marshall Student Center, Ballroom" defaultValue={initial.venueName} error={errors.venueName} />
        <Input
          id="venueAddress"
          label="Address"
          hint="Becomes a Google Maps link on the guide."
          placeholder="4103 USF Cedar Circle, Tampa, FL 33620"
          defaultValue={initial.venueAddress}
          error={errors.venueAddress}
        />
        <TextArea id="parkingInfo" label="Parking" placeholder="Free parking in Lot 18 after 5pm." defaultValue={initial.parkingInfo} error={errors.parkingInfo} />
      </Section>

      <Section title="WIFI">
        <TextArea
          id="wifiInfo"
          label="Wifi instructions"
          hint="Shown exactly as written, line breaks included."
          placeholder="Connect to eduroam with your school login, or USF-Guest (open network)."
          defaultValue={initial.wifiInfo}
          error={errors.wifiInfo}
        />
      </Section>

      <Section title="WHAT TO BRING">
        <TextArea
          id="whatToBring"
          label="Items"
          hint="One per line. Leave empty to hide the card."
          rows={5}
          defaultValue={initial.whatToBring.join("\n")}
          error={errors.whatToBring}
        />
      </Section>

      <Section title="CODE OF CONDUCT">
        <Input
          id="codeOfConductUrl"
          label="Link"
          hint="Leave empty to use MLH's official Code of Conduct."
          placeholder="https://mlh.io/code-of-conduct"
          defaultValue={initial.codeOfConductUrl}
          error={errors.codeOfConductUrl}
        />
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="pixel-btn-solid px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
        >
          {pending ? "SAVING…" : "SAVE GUIDE"}
        </button>
        <p role="status" aria-live="polite" className="text-[12px] text-text-muted">
          {state.status === "saved" && <span className="text-accent-teal">Saved. The guide is updated for everyone.</span>}
          {state.status === "invalid" && <span className="text-terminal-red">Nothing saved. Fix the fields marked below.</span>}
          {state.status === "denied" && <span className="text-terminal-red">Only organizers can edit the guide.</span>}
          {state.status === "error" && <span className="text-terminal-red">Couldn&apos;t save. Please try again.</span>}
        </p>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-text-primary/8 pt-5">
      <legend className="pr-3 font-pixel text-[9px] tracking-widest text-accent-pink">{title}</legend>
      {children}
    </fieldset>
  );
}

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue: string | null;
  error?: string;
};

function Label({ id, label, hint }: Pick<FieldProps, "id" | "label" | "hint">) {
  return (
    <label htmlFor={id} className="flex flex-col gap-0.5">
      <span className="text-xs text-text-primary">{label}</span>
      {hint && <span className="text-[11px] text-text-dim">{hint}</span>}
    </label>
  );
}

const control = (error?: string) =>
  clsx(
    "field w-full px-3.5 py-2.5 font-body text-[13px] text-text-primary placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink",
    error && "!border-terminal-red",
  );

function Input({ id, label, hint, placeholder, defaultValue, error }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label id={id} label={label} hint={hint} />
      <input id={id} name={id} defaultValue={defaultValue ?? ""} placeholder={placeholder} aria-invalid={Boolean(error)} className={control(error)} />
      {error && <span className="text-[11px] text-terminal-red">{error}</span>}
    </div>
  );
}

function TextArea({ id, label, hint, placeholder, defaultValue, error, rows = 3 }: FieldProps & { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <Label id={id} label={label} hint={hint} />
      <textarea
        id={id}
        name={id}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={clsx(control(error), "resize-y leading-[1.7]")}
      />
      {error && <span className="text-[11px] text-terminal-red">{error}</span>}
    </div>
  );
}

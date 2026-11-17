"use client";

import { useActionState, useState } from "react";
import clsx from "@/lib/clsx";
import PixelCard from "@/components/ui/PixelCard";
import Field from "@/components/ui/Field";
import { GENDERS, SHIRT_SIZES } from "@/lib/application-schema";
import type { ProfileField } from "@/lib/profile";
import { saveProfile, type SaveProfileState } from "./actions";

/**
 * The editable profile. Same layout as before; the boxes are real inputs now.
 *
 * Every input is controlled (useState) on purpose: React resets an
 * uncontrolled form after its action runs, which would wipe someone's edits
 * the moment the server said "fix this field".
 *
 * Email and school stay as read-only boxes: they can't be changed here (see
 * src/lib/profile.ts).
 */

export type ProfileInitial = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  shirtSize: string;
  school: string;
  major: string;
  graduation: string;
};

const MONTHS = [
  ["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"],
  ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"],
  ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"],
] as const;

const INPUT =
  "field w-full px-4 py-3.5 font-body card-text text-text-primary focus-visible:outline-2 focus-visible:outline-accent-pink";

const IDLE: SaveProfileState = { status: "idle" };

export default function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const [values, setValues] = useState(initial);
  const [state, formAction, pending] = useActionState(saveProfile, IDLE);
  const errors: Partial<Record<ProfileField, string>> = state.status === "invalid" ? state.errors : {};
  const set = (key: keyof ProfileInitial) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <form action={formAction}>
      <PixelCard className="p-0">
        <div className="flex flex-wrap items-center justify-end gap-4 px-7 py-5 lg:px-8">
          <span role="status" className="card-meta">
            {pending ? null : state.status === "saved" ? (
              <span className="text-terminal-green">Saved</span>
            ) : state.status === "invalid" ? (
              <span className="text-terminal-red">Fix the highlighted fields</span>
            ) : state.status === "error" ? (
              <span className="text-terminal-red">Couldn&apos;t save. Try again.</span>
            ) : null}
          </span>
          <button
            type="submit"
            disabled={pending}
            className="pixel-btn-solid inline-flex items-center justify-center gap-2 px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg transition-transform duration-200 disabled:opacity-60"
          >
            {pending ? "SAVING…" : "SAVE PROFILE CHANGES"}
          </button>
        </div>
        <div className="h-px bg-text-primary/8" />

        <ProfileSection number="01" title="BASICS" description="Your name and best contact details.">
          <Row>
            <TextInput name="firstName" label="First Name" value={values.firstName} onChange={set("firstName")} error={errors.firstName} autoComplete="given-name" />
            <TextInput name="lastName" label="Last Name" value={values.lastName} onChange={set("lastName")} error={errors.lastName} autoComplete="family-name" />
          </Row>
          <Row>
            <Locked label="Email" value={values.email} />
            <TextInput name="phone" label="Phone" type="tel" value={values.phone} onChange={set("phone")} error={errors.phone} autoComplete="tel" />
          </Row>
        </ProfileSection>

        <div className="mx-7 h-px bg-text-primary/8 lg:mx-8" />

        <ProfileSection number="02" title="ABOUT YOU" description="Shirt size and demographic info.">
          <Row>
            <Select name="gender" label="Gender" optional value={values.gender} onChange={set("gender")} error={errors.gender}>
              <option value="">Prefer not to say</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
            <Select name="shirtSize" label="Shirt Size" value={values.shirtSize} onChange={set("shirtSize")} error={errors.shirtSize}>
              {!values.shirtSize && <option value="">Pick a size</option>}
              {SHIRT_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </Select>
          </Row>
        </ProfileSection>

        <div className="mx-7 h-px bg-text-primary/8 lg:mx-8" />

        <ProfileSection number="03" title="ACADEMIC INFO" description="Your school, major, and graduation.">
          <Row>
            <Locked label="School" value={values.school} />
            <TextInput name="major" label="Major" value={values.major} onChange={set("major")} error={errors.major} />
          </Row>
          <Row>
            <Graduation value={values.graduation} onChange={set("graduation")} error={errors.graduation} />
            <div className="flex-1" />
          </Row>
        </ProfileSection>
      </PixelCard>
    </form>
  );
}

function ProfileSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-9 px-7 py-8 sm:flex-row sm:gap-10 lg:px-8">
      <div className="w-full shrink-0 sm:w-[230px]">
        <div className="mb-2 card-title text-accent-pink">{number}</div>
        <div className="mb-2 card-text font-bold tracking-wide">{title}</div>
        <div className="card-meta text-text-muted">{description}</div>
      </div>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4.5 sm:flex-row">{children}</div>;
}

function Label({ htmlFor, label, optional }: { htmlFor: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block card-meta text-text-primary">
      {label}
      {optional && <span className="ml-1.5 italic text-text-dim">Optional</span>}
    </label>
  );
}

function ErrorText({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={id} className="mt-1.5 card-meta text-terminal-red">
      {error}
    </p>
  ) : null;
}

function TextInput({
  name,
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
}: {
  name: ProfileField;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
}) {
  const id = `profile-${name}`;
  return (
    <div className="flex-1">
      <Label htmlFor={id} label={label} />
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={clsx(INPUT, error && "border-terminal-red!")}
      />
      <ErrorText id={`${id}-error`} error={error} />
    </div>
  );
}

function Select({
  name,
  label,
  optional,
  value,
  onChange,
  error,
  children,
}: {
  name: ProfileField;
  label: string;
  optional?: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  children: React.ReactNode;
}) {
  const id = `profile-${name}`;
  return (
    <div className="flex-1">
      <Label htmlFor={id} label={label} optional={optional} />
      <Chevron>
        <select
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={clsx(INPUT, "cursor-pointer appearance-none pr-10", error && "border-terminal-red!")}
        >
          {children}
        </select>
      </Chevron>
      <ErrorText id={`${id}-error`} error={error} />
    </div>
  );
}

/** Month and year as two selects, stored as "YYYY-MM" like the application. */
function Graduation({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [year, month] = value ? value.split("-") : ["", ""];
  const [draft, setDraft] = useState({ year: year ?? "", month: month ?? "" });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => String(thisYear + i));
  // Keep what's on file selectable even if it's now in the past.
  if (draft.year && !years.includes(draft.year)) years.unshift(draft.year);

  const pick = (next: { year: string; month: string }) => {
    setDraft(next);
    onChange(next.year && next.month ? `${next.year}-${next.month}` : "");
  };

  return (
    <div className="flex-1">
      <Label htmlFor="profile-graduation" label="Graduation Date" />
      <input type="hidden" name="graduation" value={value} />
      <div className="flex gap-2.5">
        <Chevron className="flex-1">
          <select
            id="profile-graduation"
            aria-label="Graduation month"
            value={draft.month}
            onChange={(e) => pick({ ...draft, month: e.target.value })}
            aria-invalid={!!error}
            className={clsx(INPUT, "cursor-pointer appearance-none pr-10", error && "border-terminal-red!")}
          >
            <option value="">Month</option>
            {MONTHS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </Chevron>
        <Chevron className="w-[120px] shrink-0">
          <select
            aria-label="Graduation year"
            value={draft.year}
            onChange={(e) => pick({ ...draft, year: e.target.value })}
            aria-invalid={!!error}
            className={clsx(INPUT, "cursor-pointer appearance-none pr-10", error && "border-terminal-red!")}
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </Chevron>
      </div>
      <ErrorText id="profile-graduation-error" error={error} />
    </div>
  );
}

/** A box that can't be edited here, with a note on how to change it. */
function Locked({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <Field size="lg" label={label} value={value} tone="secondary" />
      <p className="mt-1.5 card-meta text-text-dim">To change this, contact an organizer.</p>
    </div>
  );
}

/** The themed dropdown arrow; the native one is hidden (appearance-none). */
function Chevron({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("relative", className)}>
      {children}
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text-dim)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

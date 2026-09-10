"use client";

import { useReducer, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "@/lib/clsx";
import { STARFIELD } from "../../_shared";
import type { ApplicantIdentity } from "@/lib/supabase/user";
import DiscordIcon from "@/components/ui/DiscordIcon";
import SchoolPicker from "@/components/ui/SchoolPicker";
import {
  validateStep,
  STEP_FIELDS as STEP_FIELDS_BY_STEP,
  type ApplicationInput,
} from "@/lib/application-schema";
import { submitApplication, type SubmitResult } from "./actions";
import {
  applicationSteps,
  applicationConsent,
  applicationCopy,
  mlhPendingNotice,
} from "@/lib/placeholder-data";

/**
 * The application wizard — steps 1 through 5, plus the confirmation.
 *
 * Split out from /apply so the landing screen stays a Server Component: its
 * one button is a <Link>, which works before any JS loads. This file is the
 * only client bundle in the flow, and it isn't fetched until someone actually
 * starts an application.
 *
 * Built from the PLAT-35 design canvas.
 *
 * Answers live in one reducer rather than in the inputs: steps unmount as you
 * navigate, so uncontrolled fields would lose everything the moment you hit
 * NEXT. It's also what lets NEXT gate on per-step validation.
 *
 * Nothing is persisted until SUBMIT — the footer copy says so. Draft saving is
 * its own ticket.
 */

const LAST_STEP = applicationSteps.length; // 5
const DONE = LAST_STEP + 1; // 6

/** Everything the form collects. Mirrors the Zod schema and the Prisma columns. */
export type Answers = Partial<ApplicationInput>;

/**
 * The email is seeded from Discord so the applicant doesn't retype it, and
 * agreedMarketing starts false because MLH marketing is opt-in — an unticked
 * box has to mean "no", not "unanswered".
 */
function initialAnswers(identity: ApplicantIdentity): Answers {
  return { email: identity.email ?? "", agreedMarketing: false };
}

function answersReducer(state: Answers, patch: Answers): Answers {
  return { ...state, ...patch };
}

export default function ApplicationWizard({ identity }: { identity: ApplicantIdentity }) {
  // Starts at 1: step 0 (sign-in) is the server-rendered /apply page, so that
  // screen needs no hydration to be clickable.
  const [step, setStep] = useState(1);
  const [answers, patch] = useReducer(answersReducer, identity, initialAnswers);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, startTransition] = useTransition();

  function goNext() {
    const stepErrors = validateStep(step, answers);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    if (step < LAST_STEP) return setStep((s) => s + 1);

    startTransition(async () => {
      const res = await submitApplication(answers as ApplicationInput);
      setResult(res);
      // A server-side validation failure means something got past the client
      // gate — send them back to the step that owns the first bad field.
      if (!res.ok && res.error === "validation") {
        setErrors(res.fields);
        const first = Object.keys(res.fields)[0];
        const owning = ([1, 2, 3, 4, 5] as const).find((n) =>
          (STEP_FIELDS_BY_STEP[n] as readonly string[]).includes(first),
        );
        if (owning) setStep(owning);
      }
    });
  }

  if (result?.ok) return <Submitted email={answers.email ?? identity.email} />;
  if (result && !result.ok && result.error === "duplicate") {
    return <AlreadyApplied username={identity.username} />;
  }
  if (result && !result.ok && result.error === "closed") return <ApplicationsClosed />;

  return (
    <Wizard
      step={step}
      identity={identity}
      answers={answers}
      errors={errors}
      pending={pending}
      failed={result && !result.ok && (result.error === "unknown" || result.error === "unauthenticated") ? result.error : null}
      onChange={patch}
      onBack={() => {
        setErrors({});
        setStep((s) => Math.max(1, s - 1));
      }}
      onNext={goNext}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const FIELD =
  "w-full bg-surface-bg/60 border border-[rgba(244,241,251,0.14)] px-[14px] py-3 text-[13px] text-text-primary placeholder:text-text-dim outline-none focus:border-accent-teal/55 focus:shadow-[0_0_0_3px_rgba(33,230,193,0.1)] transition-colors";

/**
 * Option lists. Values are stored verbatim — no codes — so a row in the
 * database reads the same as what the applicant picked, and MLH reporting
 * doesn't need a lookup table.
 */
const COUNTRIES = ["United States", "Canada", "Mexico", "India", "Other"];
const LEVELS_OF_STUDY = [
  "Undergraduate University (3+ year)",
  "Undergraduate University (2 year)",
  "Graduate University (Masters, Doctoral, etc)",
  "High School",
  "Code School / Bootcamp",
  "Other",
];
const GENDERS = ["Woman", "Man", "Non-binary", "Prefer to self-describe"];
const RACES = [
  "Asian",
  "Black or African American",
  "Hispanic / Latino / Spanish Origin",
  "Middle Eastern",
  "Native American or Alaskan Native",
  "Native Hawaiian or Other Pacific Islander",
  "White",
  "Other",
];
const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

const MONTHS = [
  ["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"],
  ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"],
  ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"],
] as const;

/**
 * Graduation month and year, as two selects rather than <input type="month">.
 *
 * The month input renders as a fiddly MM/YYYY spinner that happily returns a
 * half-filled value — that's how a bare "2008" reached the database. Two
 * selects can't be partially valid, need no format hint, and behave the same
 * in every browser.
 *
 * Still stores the "YYYY-MM" string the schema and column expect.
 */
function GraduationField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const [year, month] = value.split("-");
  // Only future years: a graduation date in the past is always a mistake.
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => String(thisYear + i));

  const set = (y: string, m: string) => onChange(y && m ? `${y}-${m}` : "");

  return (
    <div className="flex gap-2">
      <select
        aria-label="Graduation month"
        value={month ?? ""}
        onChange={(e) => set(year ?? "", e.target.value)}
        className={clsx(FIELD, invalid && "border-terminal-red!")}
      >
        <option value="">Month</option>
        {MONTHS.map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
      <select
        aria-label="Graduation year"
        value={year ?? ""}
        onChange={(e) => set(e.target.value, month ?? "")}
        className={clsx(FIELD, "w-[110px]", invalid && "border-terminal-red!")}
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div role="alert" className="mt-1.5 text-[11px] text-terminal-red">
      {msg}
    </div>
  );
}

function Label({ children, optional }: { children: ReactNode; optional?: boolean }) {
  return (
    <div className="mb-2 text-xs text-text-primary">
      {children}
      {optional && <span className="ml-1.5 italic text-text-dim">Optional</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Steps 1-5 — the wizard                                              */
/* ------------------------------------------------------------------ */

function Wizard({
  step,
  identity,
  answers,
  errors,
  pending,
  failed,
  onChange,
  onBack,
  onNext,
}: {
  step: number;
  identity: ApplicantIdentity;
  answers: Answers;
  errors: Record<string, string>;
  pending: boolean;
  failed: "unknown" | "unauthenticated" | null;
  onChange: (patch: Answers) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const current = applicationSteps[step - 1];
  const isLast = step === LAST_STEP;

  return (
    <div className={clsx("flex min-h-screen flex-col md:flex-row", STARFIELD)}>
      {/* rail — the step list, plus the Earth growing as you descend */}
      <aside className="hidden w-[262px] shrink-0 flex-col border-r-4 border-border-default bg-surface-sidebar px-[18px] py-7 md:flex">
        <Image
          src="/hackjam26-words.png"
          alt="HackJam '26"
          width={380}
          height={85}
          className="mb-2.5 ml-1 h-auto w-[138px] [image-rendering:pixelated]"
        />
        <div className="mb-5 ml-1 font-pixel text-[7px] tracking-[0.14em] text-text-faintest">
          APPLICATION
        </div>

        <nav className="flex flex-col gap-0.5">
          {applicationSteps.map((s, i) => {
            const idx = i + 1;
            const active = idx === step;
            const done = idx < step;
            return (
              <div
                key={s.number}
                className={clsx(
                  "flex items-center gap-2.5 px-2.5 py-2.5",
                  active && "bg-text-primary/5",
                )}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0"
                  style={{
                    background: active ? s.accent : done ? "var(--color-accent-teal)" : "transparent",
                  }}
                />
                <span
                  className="font-pixel text-[8px]"
                  style={{ color: active ? s.accent : "var(--color-text-faintest)" }}
                >
                  {s.number}
                </span>
                <span
                  className="text-[11px] font-bold tracking-wide"
                  style={{
                    color: active
                      ? s.accent
                      : done
                        ? "var(--color-text-muted)"
                        : "var(--color-text-faintest)",
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </nav>

        <div className="flex flex-1 items-end justify-center pb-5">
          <div className="text-center">
            <Image
              src="/earth.webp"
              alt=""
              width={120}
              height={120}
              unoptimized
              style={{ width: current.earthPx, height: "auto" }}
              className="[image-rendering:pixelated]"
            />
            <div className="mt-2.5 font-pixel text-[7px] tracking-[0.12em] text-text-faintest">
              {current.zone}
            </div>
          </div>
        </div>

        <Image
          src="/shpe-usf-horiz-ko.png"
          alt="SHPE USF"
          width={380}
          height={69}
          className="mb-4 h-auto w-[150px] opacity-[0.82]"
        />
        <div className="flex items-center gap-2 text-[10px] tracking-wide text-text-faintest">
          <span className="truncate uppercase">{identity.username}</span>
          <form action="/auth/signout" method="post" className="ml-auto shrink-0">
            <button type="submit" className="text-[10px] uppercase tracking-wide hover:text-accent-pink">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex flex-1 flex-col px-6 py-8 md:px-11 md:py-9">
        {/* header: heading, progress blocks, altitude readout */}
        <div className="mb-5 flex items-end justify-between gap-6">
          <div>
            <h1 className="mb-3.5 font-pixel text-lg md:text-xl">{current.heading}</h1>
            <div className="flex gap-1.5">
              {applicationSteps.map((s, i) => (
                <div
                  key={s.number}
                  className="h-2.5 w-10 md:w-[62px]"
                  style={{
                    background: i + 1 <= step ? s.accent : "var(--color-border-default)",
                    boxShadow: i + 1 <= step ? `0 0 10px ${s.accent}` : undefined,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="mb-1.5 flex items-baseline justify-end gap-2">
              <span className="font-pixel text-[7px] tracking-[0.12em] text-text-faintest">ALT</span>
              <span className="font-pixel text-[15px]" style={{ color: current.accent }}>
                {current.altitude}
              </span>
              <span className="font-pixel text-[7px] tracking-[0.12em] text-text-faintest">KM</span>
            </div>
            <div className="font-pixel text-[8px] tracking-[0.12em] text-text-dim">
              STEP {step} / {LAST_STEP}
            </div>
          </div>
        </div>

        {/* the card */}
        <div
          className="pixel-card flex flex-1 flex-col gap-8 px-7 py-7 sm:flex-row sm:gap-9"
          style={{ "--pc-border": current.accent } as React.CSSProperties}
        >
          <div className="w-full shrink-0 sm:w-[196px]">
            <div className="mb-2.5 font-pixel text-[9px]" style={{ color: current.accent }}>
              {current.number}
            </div>
            <div className="mb-2.5 text-[13px] font-bold tracking-wide">{current.label}</div>
            <div className="text-xs leading-[1.65] text-text-muted">{current.blurb}</div>
          </div>

          <div className="flex flex-1 flex-col gap-[19px]">
            <StepFields step={step} identity={identity} answers={answers} errors={errors} onChange={onChange} />
          </div>
        </div>

        {failed && (
          <div role="alert" className="mt-4 border-l-[3px] border-terminal-red bg-terminal-red/6 px-3.5 py-2.5 text-[11px] leading-[1.7] text-text-muted">
            {failed === "unauthenticated"
              ? "Your session expired. Sign in again and your answers on this screen will still be here."
              : "Something went wrong saving your application. Nothing was lost — try submitting again."}
          </div>
        )}

        {/* footer nav */}
        <div className="mt-5 flex items-center justify-between gap-4">
          {step === 1 ? (
            <Link
              href="/apply"
              className="pixel-btn-outline bg-surface-bg px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-text-primary"
            >
              &larr; BACK
            </Link>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="pixel-btn-outline bg-surface-bg px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-text-primary"
            >
              &larr; BACK
            </button>
          )}
          <span className="hidden text-[11px] text-text-faintest sm:block">
            {applicationCopy.footerHint}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={pending}
            className={clsx(
              "pixel-btn-solid px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg",
              pending && "cursor-not-allowed opacity-70",
            )}
          >
            {pending ? "SUBMITTING…" : isLast ? "SUBMIT APPLICATION" : "NEXT →"}
          </button>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-step field groups                                               */
/* ------------------------------------------------------------------ */

function StepFields({
  step,
  identity,
  answers,
  errors,
  onChange,
}: {
  step: number;
  identity: ApplicantIdentity;
  answers: Answers;
  errors: Record<string, string>;
  onChange: (patch: Answers) => void;
}) {
  /** Wires one field to the reducer and shows its error. */
  const f = (name: keyof ApplicationInput) => ({
    value: (answers[name] as string | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ [name]: e.target.value } as Answers),
    "aria-invalid": errors[name] ? true : undefined,
    className: clsx(FIELD, errors[name] && "border-terminal-red!"),
  });
  if (step === 1) {
    return (
      <>
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label>First Name</Label>
            <input {...f("firstName")} placeholder="As it appears on your student ID" />
            <FieldError msg={errors.firstName} />
          </div>
          <div className="flex-1">
            <Label>Last Name</Label>
            <input {...f("lastName")} />
            <FieldError msg={errors.lastName} />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <input {...f("email")} type="email" placeholder="you@usf.edu" />
          <FieldError msg={errors.email} />
            <div className="mt-2 text-[11px] text-text-faintest">
              {identity.email
                ? "From your Discord account — change it if you'd rather we used another."
                : "Discord didn't share an email, so we need one here."}
            </div>
        </div>
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label>Phone</Label>
            <input {...f("phone")} placeholder="(___) ___-____" />
              <FieldError msg={errors.phone} />
          </div>
          <div className="flex-1">
            <Label>
              Discord <span className="text-text-faintest">from sign-in</span>
            </Label>
            <div className="flex w-full items-center gap-2.5 border border-text-primary/7 bg-surface-bg/35 px-[14px] py-3 text-[13px] text-text-faintest">
              {identity.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={identity.avatarUrl}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-full"
                />
              ) : (
                <DiscordIcon size={14} />
              )}
              <span className="truncate">{identity.username}</span>
              <span className="ml-auto shrink-0 text-[10px] text-accent-teal">VERIFIED</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label>Date of Birth</Label>
            <input {...f("dateOfBirth")} type="date" />
            <FieldError msg={errors.dateOfBirth} />
          </div>
          <div className="flex-1">
            <Label>Country of Residence</Label>
            <select {...f("country")}>
              <option value="">Select…</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <FieldError msg={errors.country} />
          </div>
        </div>
        <div>
          <Label>Level of Study</Label>
          <select {...f("levelOfStudy")}>
            <option value="">Select…</option>
            {LEVELS_OF_STUDY.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <FieldError msg={errors.levelOfStudy} />
        </div>
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label optional>Gender</Label>
            <select {...f("gender")}>
              <option value="">Prefer not to answer</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <Label optional>Race / Ethnicity</Label>
            <select {...f("raceEthnicity")}>
              <option value="">Prefer not to answer</option>
              {RACES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="border-l-[3px] border-accent-purple bg-accent-purple/12 px-3.5 py-2.5 text-[11px] leading-[1.7] text-text-muted">
          SHPE is a Hispanic-serving organization, but HackJam is open to every USF student
          regardless of background.
        </div>
      </>
    );
  }

  if (step === 3) {
    return (
      <>
        <div>
          <Label>School</Label>
          {/* Manual entry is allowed on purpose: MLH's catalogue still misses
              schools, and a forced pick produces a silent wrong answer or a
              silent abandon. The source flag below is what keeps the data
              clean despite that. */}
          <SchoolPicker
            defaultValue={answers.school ?? ""}
            allowManualEntry
            onChange={(name, source) => onChange({ school: name, schoolSource: source })}
          />
          <FieldError msg={errors.school} />
          {answers.schoolSource === "manual" && (
            <div className="mt-2 flex gap-2 text-[11px] leading-[1.7] text-accent-amber">
              <span aria-hidden>&#9888;</span>
              <span>
                Not on MLH&apos;s verified list. We&apos;ll confirm this with you and submit it
                to MLH before the event.
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label>Major</Label>
            <input {...f("major")} placeholder="e.g. Computer Engineering" />
            <FieldError msg={errors.major} />
          </div>
          <div className="flex-1">
            <Label>Graduation</Label>
            <GraduationField
              value={answers.graduation ?? ""}
              onChange={(v) => onChange({ graduation: v })}
              invalid={!!errors.graduation}
            />
            <FieldError msg={errors.graduation} />
          </div>
          <div className="sm:w-[132px]">
            <Label>Shirt Size</Label>
            <select {...f("shirtSize")}>
              <option value="">Select…</option>
              {SHIRT_SIZES.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <FieldError msg={errors.shirtSize} />
          </div>
        </div>
      </>
    );
  }

  if (step === 4) {
    return (
      <>
        {(["whyAttend", "whatBuild"] as const).map((key, i) => (
          <div key={key}>
            <Label>
              {applicationCopy.questions[i]}{" "}
              <span className="text-accent-amber">[PLACEHOLDER]</span>
            </Label>
            <textarea
              {...f(key)}
              className={clsx(FIELD, "h-[74px] resize-none", errors[key] && "border-terminal-red!")}
              placeholder="A few sentences is plenty…"
            />
            <FieldError msg={errors[key]} />
          </div>
        ))}
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label optional>GitHub</Label>
            <input {...f("gitHub")} placeholder="username or URL" />
          </div>
          <div className="flex-1">
            <Label optional>LinkedIn</Label>
            <input {...f("linkedIn")} placeholder="username or URL" />
          </div>
        </div>
        <div className="flex items-center gap-3.5 border border-dashed border-text-primary/20 bg-surface-bg/60 px-3.5 py-3.5">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-pink-light)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3v5h5" />
            <path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          </svg>
          <span className="flex-1 text-xs text-text-dim">
            Resume &mdash; PDF, max 5MB &middot; shared with sponsors
          </span>
          <span className="pixel-btn-outline cursor-pointer bg-surface-bg px-4 py-2.5 font-body text-[10px] font-bold tracking-wide">
            CHOOSE FILE
          </span>
        </div>
      </>
    );
  }

  // step 5 — agreements
  return (
    <>
        {applicationConsent.map((c) => {
          const key = c.field as "agreedCodeOfConduct" | "agreedDataSharing" | "agreedMarketing";
          return (
        <label
          key={c.id}
          className="flex cursor-pointer gap-3.5 bg-surface-bg/45 px-4 py-3.5"
        >
            {/* Never defaultChecked: a pre-ticked box is not a record of consent. */}
            <input
              type="checkbox"
              checked={answers[key] === true}
              onChange={(e) => onChange({ [key]: e.target.checked } as Answers)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-teal)]"
            />
          <span className="text-xs leading-[1.7] text-text-secondary">
            {c.text}{" "}
            {c.required ? (
              <span className="text-accent-pink">*</span>
            ) : (
              <span className="italic text-text-dim">Optional</span>
            )}
          </span>
        </label>
          );
        })}
        {(errors.agreedCodeOfConduct || errors.agreedDataSharing) && (
          <div className="text-[11px] text-terminal-red">
            Accept every required agreement to continue.
          </div>
        )}
      <div className="border-l-[3px] border-accent-amber bg-accent-amber/6 px-3.5 py-2.5 text-[11px] leading-[1.7] text-text-muted">
        {mlhPendingNotice}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Step 6 — submitted                                                  */
/* ------------------------------------------------------------------ */

/** Shared chrome for the terminal-window result screens. */
function ResultScreen({
  filename,
  tag,
  tagColor,
  heading,
  children,
}: {
  filename: string;
  tag: string;
  tagColor: string;
  heading: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={clsx("flex min-h-screen items-center justify-center px-6 py-10", STARFIELD)}>
      <div className="terminal-window w-full max-w-[620px]">
        <div className="terminal-bar flex items-center gap-2.5 px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 bg-terminal-red" />
          <span className="h-2.5 w-2.5 bg-terminal-yellow" />
          <span className="h-2.5 w-2.5 bg-terminal-green" />
          <span className="ml-1.5 font-pixel text-[8px] text-text-secondary">{filename}</span>
        </div>
        <div className="relative px-7 pb-7 pt-8 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-5 [background:repeating-linear-gradient(to_bottom,#f4f1fb_0_1px,transparent_1px_3px)]" />
          <div className="mb-4 font-pixel text-[9px] tracking-widest" style={{ color: tagColor }}>
            {tag}
          </div>
          <h2 className="mb-4 font-pixel text-lg leading-[1.7]">{heading}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/** PLAT-25 — the unique constraint on (person, event) got there first. */
function AlreadyApplied({ username }: { username: string }) {
  return (
    <ResultScreen
      filename="APPLICATION.LOG"
      tag="// ALREADY APPLIED"
      tagColor="var(--color-accent-amber)"
      heading="ONE PER HACKER"
    >
      <p className="mb-6 text-[13px] leading-[1.8] text-text-muted">
        You&apos;ve already applied as <span className="text-accent-purple-light">{username}</span>.
        We only take one application per Discord account.
      </p>
      <Link
        href="/dashboard"
        className="pixel-btn-solid inline-flex px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg"
      >
        VIEW MY APPLICATION &rarr;
      </Link>
    </ResultScreen>
  );
}

/** No event is currently accepting applications. */
function ApplicationsClosed() {
  return (
    <ResultScreen
      filename="APPLICATION.LOG"
      tag="// APPLICATIONS CLOSED"
      tagColor="var(--color-text-dim)"
      heading={<>THAT&apos;S A WRAP</>}
    >
      <p className="text-[13px] leading-[1.8] text-text-muted">
        Applications aren&apos;t open right now. Follow us on Discord and we&apos;ll announce the
        next one there first.
      </p>
    </ResultScreen>
  );
}

function Submitted({ email }: { email: string | null }) {
  return (
    <div className={clsx("flex min-h-screen items-center justify-center px-6 py-10", STARFIELD)}>
      <div className="terminal-window w-full max-w-[620px]">
        <div className="terminal-bar flex items-center gap-2.5 px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 bg-terminal-red" />
          <span className="h-2.5 w-2.5 bg-terminal-yellow" />
          <span className="h-2.5 w-2.5 bg-terminal-green" />
          <span className="ml-1.5 font-pixel text-[8px] text-text-secondary">APPLICATION.LOG</span>
        </div>
        <div className="relative px-7 pb-7 pt-8 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-5 [background:repeating-linear-gradient(to_bottom,#f4f1fb_0_1px,transparent_1px_3px)]" />
          <div className="mb-4 font-pixel text-[9px] tracking-widest text-accent-teal">// SUBMITTED</div>
          <h2 className="mb-4 font-pixel text-lg leading-[1.7]">
            YOU&apos;RE IN
            <br />
            THE PILE
          </h2>
          <p className="mb-5 text-[13px] leading-[1.8] text-text-muted">
            We&apos;ll email{" "}
            <span className="text-accent-teal">{email ?? "the address you gave us"}</span> when
            decisions go out.
          </p>
          <div className="mx-auto mb-6 max-w-[320px] text-left text-xs leading-[2.05] text-text-dim">
            <div><span className="text-accent-teal">$</span> application --submit <span className="text-terminal-green">OK</span></div>
            <div><span className="text-accent-teal">$</span> confirmation --email <span className="text-terminal-green">SENT</span></div>
            <div><span className="text-accent-teal">$</span> review --status <span className="text-terminal-yellow">PENDING</span></div>
          </div>
          <div className="flex flex-wrap justify-center gap-3.5">
            <Link
              href="/dashboard"
              className="pixel-btn-solid px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg"
            >
              CONTINUE TO DASHBOARD &rarr;
            </Link>
            <Link
              href="/apply"
              className="pixel-btn-outline bg-surface-bg px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-text-primary"
            >
              REPLAY FLOW
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

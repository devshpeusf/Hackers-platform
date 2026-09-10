"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "@/lib/clsx";
import { STARFIELD } from "../../_shared";
import type { ApplicantIdentity } from "@/lib/supabase/user";
import DiscordIcon from "@/components/ui/DiscordIcon";
import SchoolPicker, { type SchoolSelection } from "@/components/ui/SchoolPicker";
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
 * COSMETIC ONLY. There is no backend: sign-in doesn't authenticate, nothing
 * validates, and submitting just advances local state. Every input is
 * uncontrolled so typing feels real while you click through — none of it is
 * read anywhere. Real submission is PLAT-22; Discord OAuth is PLAT-12.
 */

const LAST_STEP = applicationSteps.length; // 5
const DONE = LAST_STEP + 1; // 6

export default function ApplicationWizard({ identity }: { identity: ApplicantIdentity }) {
  // Starts at 1: step 0 (sign-in) is now the server-rendered /apply page, so
  // that screen needs no hydration to be clickable.
  const [step, setStep] = useState(1);
  /**
   * Held here rather than inside the step so it survives Back/Next, and so
   * whoever wires submission (PLAT-22) finds the source flag already tracked
   * rather than having to add it.
   */
  const [school, setSchool] = useState<SchoolSelection | null>(null);

  if (step === DONE) return <Submitted email={identity.email} />;

  return (
    <Wizard
      step={step}
      identity={identity}
      school={school}
      onSchoolChange={setSchool}
      onBack={() => setStep((s) => Math.max(1, s - 1))}
      onNext={() => setStep((s) => s + 1)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const FIELD =
  "w-full bg-surface-bg/60 border border-[rgba(244,241,251,0.14)] px-[14px] py-3 text-[13px] text-text-primary placeholder:text-text-dim outline-none focus:border-accent-teal/55 focus:shadow-[0_0_0_3px_rgba(33,230,193,0.1)] transition-colors";

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
  school,
  onSchoolChange,
  onBack,
  onNext,
}: {
  step: number;
  identity: ApplicantIdentity;
  school: SchoolSelection | null;
  onSchoolChange: (s: SchoolSelection) => void;
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
            <StepFields step={step} identity={identity} school={school} onSchoolChange={onSchoolChange} />
          </div>
        </div>

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
            className="pixel-btn-solid px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg"
          >
            {isLast ? "SUBMIT APPLICATION" : "NEXT →"}
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
  school,
  onSchoolChange,
}: {
  step: number;
  identity: ApplicantIdentity;
  school: SchoolSelection | null;
  onSchoolChange: (s: SchoolSelection) => void;
}) {
  if (step === 1) {
    return (
      <>
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label>First Name</Label>
            <input className={FIELD} name="firstName" placeholder="As it appears on your student ID" />
          </div>
          <div className="flex-1">
            <Label>Last Name</Label>
            <input className={FIELD} name="lastName" placeholder="" />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <input
              className={FIELD}
              type="email"
              name="email"
              defaultValue={identity.email ?? ""}
              placeholder="you@usf.edu"
            />
            <div className="mt-2 text-[11px] text-text-faintest">
              {identity.email
                ? "From your Discord account — change it if you'd rather we used another."
                : "Discord didn't share an email, so we need one here."}
            </div>
        </div>
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label>Phone</Label>
            <input className={FIELD} placeholder="(___) ___-____" />
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
            <input className={FIELD} type="date" defaultValue="2004-03-18" />
          </div>
          <div className="flex-1">
            <Label>Country of Residence</Label>
            <select className={FIELD} defaultValue="us">
              <option value="us">United States</option>
              <option value="ca">Canada</option>
              <option value="mx">Mexico</option>
            </select>
          </div>
        </div>
        <div>
          <Label>Level of Study</Label>
          <select className={FIELD} defaultValue="ug3">
            <option value="ug3">Undergraduate University (3+ year)</option>
            <option value="ug2">Undergraduate University (2 year)</option>
            <option value="grad">Graduate University</option>
          </select>
        </div>
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label optional>Gender</Label>
            <select className={FIELD} defaultValue="na">
              <option value="na">Prefer not to answer</option>
              <option value="woman">Woman</option>
              <option value="man">Man</option>
              <option value="nb">Non-binary</option>
            </select>
          </div>
          <div className="flex-1">
            <Label optional>Race / Ethnicity</Label>
            <select className={FIELD} defaultValue="na">
              <option value="na">Prefer not to answer</option>
              <option value="hisp">Hispanic / Latino / Spanish Origin</option>
              <option value="other">Other</option>
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
            defaultValue={school?.name ?? ""}
            allowManualEntry
            onChange={(name, source) => onSchoolChange({ name, source })}
          />
          {school?.source === "manual" && (
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
            <input className={FIELD} defaultValue="Computer Engineering" />
          </div>
          <div className="flex-1">
            <Label>Graduation</Label>
            <input className={FIELD} type="month" defaultValue="2027-05" />
          </div>
          <div className="sm:w-[132px]">
            <Label>Shirt Size</Label>
            <select className={FIELD} defaultValue="M">
              <option>XS</option><option>S</option><option>M</option>
              <option>L</option><option>XL</option><option>2XL</option>
            </select>
          </div>
        </div>
      </>
    );
  }

  if (step === 4) {
    return (
      <>
        {applicationCopy.questions.map((q) => (
          <div key={q}>
            <Label>
              {q} <span className="text-accent-amber">[PLACEHOLDER]</span>
            </Label>
            <textarea className={clsx(FIELD, "h-[74px] resize-none")} placeholder="A few sentences is plenty…" />
          </div>
        ))}
        <div className="flex flex-col gap-[18px] sm:flex-row">
          <div className="flex-1">
            <Label optional>GitHub</Label>
            <input className={FIELD} placeholder="username or URL" />
          </div>
          <div className="flex-1">
            <Label optional>LinkedIn</Label>
            <input className={FIELD} placeholder="username or URL" />
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
      {applicationConsent.map((c) => (
        <label
          key={c.id}
          className="flex cursor-pointer gap-3.5 bg-surface-bg/45 px-4 py-3.5"
        >
          <input type="checkbox" defaultChecked={c.required} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-teal)]" />
          <span className="text-xs leading-[1.7] text-text-secondary">
            {c.text}{" "}
            {c.required ? (
              <span className="text-accent-pink">*</span>
            ) : (
              <span className="italic text-text-dim">Optional</span>
            )}
          </span>
        </label>
      ))}
      <div className="border-l-[3px] border-accent-amber bg-accent-amber/6 px-3.5 py-2.5 text-[11px] leading-[1.7] text-text-muted">
        {mlhPendingNotice}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Step 6 — submitted                                                  */
/* ------------------------------------------------------------------ */

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

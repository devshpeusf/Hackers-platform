import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireVolunteerOrAbove } from "@/lib/volunteer";
import { isOrganizer } from "@/lib/organizer";
import { applicationConsent } from "@/lib/placeholder-data";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import { STATUS_STYLE } from "../applications/status";
import { registerWalkIn, admitExisting } from "./actions";

/**
 * Registering someone at the door (PLAT-56).
 *
 * For whoever the scanner can't find: creates an application and a badge
 * token, admitted on the spot, attributed to the volunteer who did it.
 *
 * Volunteer-or-above rather than organizer-only — the door is run by
 * volunteers, and this is the first page in the app with that gate.
 *
 * A pure Server Component: plain form, Server Action, no client JavaScript.
 * The fields are deliberately few and big enough to hit on a phone at a desk
 * with a queue behind it, which is the whole situation this is for.
 */

const REQUIRED_CONSENT = applicationConsent.filter((c) => c.required);
const OPTIONAL_CONSENT = applicationConsent.filter((c) => !c.required);

export default async function WalkInPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; found?: string; admitted?: string; error?: string }>;
}) {
  const identity = await requireVolunteerOrAbove();
  const { registered, found, admitted, error } = await searchParams;

  // /admin/applications is organizer-only, so linking a volunteer there would
  // hand them a 404. Volunteers get the form and nothing else.
  const canReview = await isOrganizer(identity.discordId);

  // Only ever one of these; each is an application id to report on.
  const reportId = registered ?? admitted ?? found ?? null;
  const report = reportId
    ? await prisma.application.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          status: true,
          source: true,
          createdAt: true,
          badgeToken: true,
          person: { select: { firstName: true, lastName: true, email: true } },
        },
      })
    : null;

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[620px]">
        {canReview && (
          <Link
            href="/admin/applications"
            className="mb-6 inline-block text-[12px] text-text-muted hover:text-accent-pink"
          >
            &larr; All applications
          </Link>
        )}
        <h1 className="mb-2 font-pixel text-lg leading-[1.7] text-text-primary">WALK-IN</h1>
        <p className="mb-7 text-[13px] leading-[1.8] text-text-muted">
          For someone the scanner can&apos;t find. Admits them and issues a badge straight away.
        </p>

        {error === "invalid" && (
          <PixelCard borderColor="var(--color-terminal-red)" className="mb-6 p-5">
            <p className="text-[13px] leading-[1.8] text-text-secondary">
              Nothing was saved. Every field below is needed, the email has to look like an email,
              and both MLH boxes have to be ticked.
            </p>
          </PixelCard>
        )}

        {error === "no-event" && (
          <PixelCard borderColor="var(--color-terminal-red)" className="mb-6 p-5">
            <p className="text-[13px] leading-[1.8] text-text-secondary">
              There&apos;s no event in the database to register anyone for.
            </p>
          </PixelCard>
        )}

        {/* Registered, or admitted after being found — either way they're in. */}
        {report && (registered || admitted) && (
          <PixelCard borderColor="var(--color-terminal-green)" className="mb-6 p-5">
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <PixelChip color={STATUS_STYLE[report.status].color}>
                {STATUS_STYLE[report.status].label}
              </PixelChip>
              <span className="text-[13px] font-bold text-text-primary">
                {report.person.firstName} {report.person.lastName}
              </span>
            </div>
            <p className="text-[12px] leading-[1.7] text-text-muted">
              {registered ? "Registered" : "Admitted"} and{" "}
              {report.badgeToken ? "badge issued" : "badge pending"}. They can open their badge by
              signing in
              {canReview ? (
                <>
                  , or{" "}
                  <Link href={`/admin/applications/${report.id}`} className="text-accent-pink hover:underline">
                    view the record
                  </Link>
                </>
              ) : null}
              .
            </p>
          </PixelCard>
        )}

        {/* Found an existing application — nothing was created. */}
        {report && found && (
          <PixelCard borderColor="var(--color-accent-amber)" className="mb-6 p-5">
            <span className="font-pixel text-[9px] tracking-widest text-accent-amber">
              // ALREADY ON FILE
            </span>
            <div className="mt-3.5 mb-2.5 flex flex-wrap items-center gap-2.5">
              <PixelChip color={STATUS_STYLE[report.status].color}>
                {STATUS_STYLE[report.status].label}
              </PixelChip>
              <span className="text-[13px] font-bold text-text-primary">
                {report.person.firstName} {report.person.lastName}
              </span>
            </div>
            <p className="mb-4 text-[12px] leading-[1.7] text-text-muted">
              {report.person.email} already has{" "}
              {report.source === "WALK_IN" ? "a walk-in registration" : "an application"} for this
              event, from {report.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
              Nothing was created.
            </p>
            {report.status === "ACCEPTED" && report.badgeToken ? (
              <p className="text-[12px] leading-[1.7] text-text-secondary">
                They&apos;re already admitted with a badge &mdash; send them to their dashboard to
                show the QR.
              </p>
            ) : (
              <form action={admitExisting} className="flex flex-wrap items-center gap-3.5">
                <input type="hidden" name="applicationId" value={report.id} />
                <button
                  type="submit"
                  className="pixel-btn-solid px-5 py-3 font-body text-[12px] font-bold tracking-wide text-surface-bg"
                >
                  ADMIT &amp; ISSUE BADGE
                </button>
                <span className="text-[11px] leading-[1.6] text-text-faintest">
                  Changes their decision to accepted.
                </span>
              </form>
            )}
          </PixelCard>
        )}

        <form action={registerWalkIn}>
          <PixelCard className="mb-5 p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <Input name="firstName" label="First name" autoComplete="off" />
                <Input name="lastName" label="Last name" autoComplete="off" />
              </div>
              <Input name="email" label="Email" type="email" autoComplete="off" />
              <Input name="phoneNum" label="Phone" type="tel" autoComplete="off" />
              <Input name="school" label="School" autoComplete="off" />

              {/* Asked outright rather than derived from a date of birth: a date
                  picker at a check-in desk is the opposite of fast, and this is
                  the only thing the answer is needed for. */}
              <fieldset>
                <legend className="mb-2 block font-body text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  Under 18 at the event?
                </legend>
                <div className="flex gap-2.5">
                  <Radio name="isMinor" value="no" label="No" defaultChecked />
                  <Radio name="isMinor" value="yes" label="Yes" />
                </div>
                <p className="mt-2 text-[11px] leading-[1.6] text-text-faintest">
                  Yes means they need MLH minor consent paperwork.
                </p>
              </fieldset>
            </div>
          </PixelCard>

          {/* Verbatim MLH wording, never pre-ticked, and the action refuses
              without them. Writing consent for someone who didn't give it would
              be a fabricated record, so this is the one place the "under 30
              seconds" goal gives way. */}
          <PixelCard className="mb-5 p-6">
            <span className="font-pixel text-[9px] tracking-widest text-accent-pink">// MLH CONSENT</span>
            <p className="mt-3 mb-4 text-[12px] leading-[1.7] text-text-muted">
              Read these out or hand them the screen. Both are required.
            </p>
            <div className="flex flex-col gap-3.5">
              {REQUIRED_CONSENT.map((c) => (
                <Checkbox key={c.id} name={c.field} text={c.text} />
              ))}
              <div className="h-px bg-text-primary/8" />
              {OPTIONAL_CONSENT.map((c) => (
                <Checkbox key={c.id} name={c.field} text={c.text} optional />
              ))}
            </div>
          </PixelCard>

          <button
            type="submit"
            className="pixel-btn-solid w-full px-5 py-4 font-body text-[13px] font-bold tracking-wide text-surface-bg"
          >
            REGISTER &amp; ISSUE BADGE
          </button>
        </form>

        <p className="mt-5 text-[11px] leading-[1.7] text-text-faintest">
          Only name, email, phone and school are collected here &mdash; the review questions
          aren&apos;t asked at the door, so a walk-in&apos;s record shows those as not collected.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A real input, unlike the Field primitive — this one is submitted. Sized for
 * a thumb: `text-base` keeps iOS from zooming the viewport on focus, which on
 * a phone at a desk reads as the page jumping about.
 */
function Input({
  name,
  label,
  type = "text",
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-1 flex-col gap-2">
      <span className="font-body text-[11px] font-bold uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="field w-full bg-surface-bg px-[14px] py-3 text-base text-text-primary outline-none focus-visible:!border-accent-pink"
      />
    </label>
  );
}

function Radio({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="field flex flex-1 cursor-pointer items-center justify-center gap-2.5 bg-surface-bg px-4 py-3 text-[13px] text-text-secondary has-checked:!border-accent-pink has-checked:text-text-primary">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="accent-accent-pink" />
      {label}
    </label>
  );
}

function Checkbox({ name, text, optional }: { name: string; text: string; optional?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        className="mt-0.5 h-5 w-5 shrink-0 accent-accent-pink"
      />
      <span className="text-[12px] leading-[1.7] text-text-secondary">
        {text}
        {optional && <span className="text-text-faintest"> (optional)</span>}
      </span>
    </label>
  );
}

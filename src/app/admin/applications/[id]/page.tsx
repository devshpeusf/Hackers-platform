import Link from "next/link";
import type { ApplicationStatus, RsvpStatus } from "@/generated/prisma/client";
import clsx from "@/lib/clsx";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import { applicationCopy } from "@/lib/placeholder-data";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import Field from "@/components/ui/Field";
import { STATUS_STYLE, RSVP_LABEL } from "../status";
import {
  DECISIONS,
  announcedEmail,
  announcementBlockedReason,
  needsAnnouncement,
  canQueueRsvpInvitation,
} from "@/lib/decisions";
import { decideApplication, queueDecisionEmails, queueRsvpInvitation } from "../actions";

/**
 * One application in full, for an organizer, and where their decision gets
 * marked (PLAT-39).
 *
 * Still a pure Server Component: the decision controls are plain forms posting
 * to a Server Action, and the override hides behind a <details>, so none of it
 * needs client JavaScript.
 */

/**
 * Accept / waitlist / reject, plus what's already been promised.
 *
 * Three states: undecided (just the buttons), decided (buttons plus who and
 * when), and decided-and-announced — where the buttons move behind a <details>
 * naming what the applicant was already told. Telling someone they're in and
 * then reversing it is the worst thing this page can do, so it shouldn't be
 * one click away.
 */
function DecisionPanel({
  id,
  status,
  decidedBy,
  decidedAt,
  announced,
  pendingAnnouncement,
  blockedReason,
  outcome,
  justQueued,
  rsvpStatus,
  freshInvitation,
  invitation,
}: {
  id: string;
  status: ApplicationStatus;
  decidedBy: { firstName: string; lastName: string } | null;
  decidedAt: Date | null;
  announced: { emailType: string; sentAt: Date | null } | null;
  pendingAnnouncement: boolean;
  blockedReason: string | null;
  outcome?: string;
  justQueued: boolean;
  rsvpStatus: RsvpStatus;
  freshInvitation: boolean;
  invitation?: string;
}) {
  const buttons = (
    <div className="flex flex-wrap gap-2.5">
      {DECISIONS.map((d) => {
        const style = STATUS_STYLE[d];
        const current = d === status;
        return (
          <form key={d} action={decideApplication}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="decision" value={d} />
            {announced && <input type="hidden" name="override" value="true" />}
            <button
              type="submit"
              disabled={current}
              className={clsx(
                "pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[11px] font-bold tracking-wide",
                current && "cursor-default opacity-40",
              )}
              style={{ color: style.color }}
            >
              {current ? `✓ ${style.label}` : style.label}
            </button>
          </form>
        );
      })}
    </div>
  );

  return (
    <PixelCard className="mb-6 p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-pixel text-[9px] tracking-widest text-accent-pink">// DECISION</span>
        {decidedAt && (
          <span className="text-[11px] text-text-faintest">
            {decidedBy ? `${decidedBy.firstName} ${decidedBy.lastName}` : "Set directly in the database"}
            {" · "}
            {formatDate(decidedAt)}
          </span>
        )}
      </div>

      {outcome === "locked" && (
        <p className="mb-4 border-l-[3px] border-terminal-red bg-terminal-red/6 px-3.5 py-2.5 text-[12px] leading-[1.7] text-text-muted">
          Not changed &mdash; that decision has already been emailed. Use the override below if
          you really mean to.
        </p>
      )}

      {announced ? (
        <>
          <p className="mb-4 border-l-[3px] border-accent-amber bg-accent-amber/6 px-3.5 py-2.5 text-[12px] leading-[1.7] text-text-muted">
            This applicant was emailed <strong>{announced.emailType}</strong>
            {announced.sentAt ? ` on ${formatDate(announced.sentAt)}` : " (sending now)"}. Changing
            it now means telling them something different from what they&apos;ve already read.
          </p>
          <details>
            <summary className="cursor-pointer text-[12px] text-text-muted hover:text-accent-pink">
              Change it anyway
            </summary>
            <div className="mt-3.5">{buttons}</div>
          </details>
        </>
      ) : (
        buttons
      )}

      {status === "ACCEPTED" && (
        <div className="mt-5 space-y-3 border-t border-text-primary/8 pt-4 text-[12px] leading-[1.7] text-text-muted">
          <p>Attendance: <strong className="text-text-primary">{RSVP_LABEL[rsvpStatus]}</strong></p>
          {invitation === "queued" && <p role="status">New invitation queued for the next scheduler run.</p>}
          {invitation === "blocked" && <p role="alert">Invitation not queued. Check the RSVP email configuration.</p>}
          {freshInvitation && (
            <form action={queueRsvpInvitation}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[11px] font-bold tracking-wide text-text-primary">
                QUEUE NEW RSVP INVITATION
              </button>
              <p className="mt-2 text-[11px] text-text-faintest">Queues a fresh invitation for the next scheduler run.</p>
            </form>
          )}
        </div>
      )}

      {/* Whether this one person has been told, and the one-off send (PLAT-42).
          The batch path is /admin/applications/send; this is for a decision
          made after that batch went out. */}
      {status !== "SUBMITTED" && !announced && !freshInvitation && (
        <div className="mt-5 border-t border-text-primary/8 pt-4">
          {justQueued ? (
            <p className="text-[12px] leading-[1.7] text-terminal-green">
              Email queued — it goes out on the next scheduler run.
            </p>
          ) : blockedReason ? (
            <p className="text-[12px] leading-[1.7] text-text-muted">
              Not emailed yet &mdash; {blockedReason}.
            </p>
          ) : pendingAnnouncement ? (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <form action={queueDecisionEmails}>
                <input type="hidden" name="id" value={id} />
                <button
                  type="submit"
                  className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[11px] font-bold tracking-wide text-text-primary"
                >
                  EMAIL THIS DECISION
                </button>
              </form>
              <span className="text-[11px] leading-[1.6] text-text-faintest">
                Queues one email. Nothing leaves until the next scheduler run.
              </span>
            </div>
          ) : (
            <p className="text-[12px] leading-[1.7] text-text-muted">
              Email already queued &mdash; follow it on{" "}
              <Link href="/admin/email-queue" className="text-accent-pink hover:underline">
                the email queue
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </PixelCard>
  );
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "2027-05" -> "May 2027". Falls back to the raw value for older rows. */
function formatGraduation(v: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return v;
  return new Date(Number(m[1]), Number(m[2]) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function AdminApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ decision?: string; queued?: string; invitation?: string }>;
}) {
  await requireOrganizer();
  const { id } = await params;
  const { decision: outcome, queued, invitation } = await searchParams;

  const a = await prisma.application.findUnique({
    where: { id },
    include: {
      person: { include: { resume: true } },
      event: true,
      decidedBy: { select: { firstName: true, lastName: true } },
      emailQueue: { select: { emailType: true, status: true, sentAt: true } },
      rsvpTokens: { select: { revokedAt: true, expiresAt: true } },
    },
  });
  if (!a) notFound();

  const status = STATUS_STYLE[a.status];

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[860px]">
        <Link
          href="/admin/applications"
          className="mb-6 inline-block text-[12px] text-text-muted hover:text-accent-pink"
        >
          &larr; All applications
        </Link>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="mb-2 break-words font-pixel text-lg leading-[1.7] text-text-primary">
              {a.person.firstName} {a.person.lastName}
            </h1>
            <p className="break-words text-[13px] text-text-muted">{a.person.email}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <PixelChip color={status.color}>{status.label}</PixelChip>
            <span className="text-[11px] text-text-faintest">
              Applied {formatDate(a.createdAt)} · {a.event.name}
            </span>
          </div>
        </div>

        <DecisionPanel
          id={a.id}
          status={a.status}
          decidedBy={a.decidedBy}
          decidedAt={a.decidedAt}
          announced={announcedEmail(a.status, a.emailQueue)}
          pendingAnnouncement={needsAnnouncement(a.status, a.emailQueue)}
          blockedReason={
            a.status === "SUBMITTED"
              ? null
              : announcementBlockedReason(a.status, process.env.RSVP_URL)
          }
          outcome={outcome}
          justQueued={Number(queued) > 0}
          rsvpStatus={a.rsvpStatus}
          freshInvitation={canQueueRsvpInvitation(a, new Date())}
          invitation={invitation}
        />

        <PixelCard className="p-0">
          <Section number="01" title="BASICS">
            <Field label="Phone" value={a.person.phoneNum} tone="secondary" />
            <Field label="Date of Birth" value={formatDate(a.dateOfBirth)} tone="secondary" />
            <Field label="Minor at event" value={a.isMinor ? "Yes — needs MLH minor consent" : "No"} tone="secondary" />
            <Field label="Country" value={a.country} tone="secondary" />
            <Field label="Gender" optional value={a.gender ?? undefined} placeholder="Not given" tone="secondary" />
            <Field label="Race / Ethnicity" optional value={a.raceEthnicity ?? undefined} placeholder="Not given" tone="secondary" />
          </Section>

          <Divider />

          <Section number="02" title="SCHOOL">
            <Field label="School" value={a.school} tone="secondary" />
            <Field label="Level of Study" value={a.levelOfStudy} tone="secondary" />
            <Field label="Major" value={a.major} tone="secondary" />
            <Field label="Graduation" value={formatGraduation(a.graduation)} tone="secondary" />
            <Field label="Shirt Size" value={a.shirtSize} tone="secondary" />
            <Field label="Dietary Restriction" value={a.diet} tone="secondary" />
          </Section>

          <Divider />

          <Section number="03" title="EXPERIENCE">
            <Field label={applicationCopy.questions[0]} value={a.whyAttend} multiline tone="secondary" />
            <Field label={applicationCopy.questions[1]} value={a.whatBuild} multiline tone="secondary" />
            <Field label={applicationCopy.questions[2]} value={a.quirkFact} multiline tone="secondary" />
            <Field label="GitHub" optional value={a.gitHub ?? undefined} placeholder="Not given" tone="secondary" />
            <Field label="LinkedIn" optional value={a.linkedIn ?? undefined} placeholder="Not given" tone="secondary" />
          </Section>

          <Divider />

          <Section number="04" title="RESUME">
            <ResumePanel applicationId={a.id} resume={a.person.resume} />
          </Section>

          <Divider />

          <Section number="05" title="CONSENT">
            <Field label="MLH Code of Conduct" value={a.agreedCodeOfConduct ? "Agreed" : "Not agreed"} tone="secondary" />
            <Field label="MLH data sharing" value={a.agreedDataSharing ? "Agreed" : "Not agreed"} tone="secondary" />
            <Field label="MLH marketing" value={a.agreedMarketing ? "Opted in" : "Opted out"} tone="secondary" />
            <Field label="Agreed on" value={formatDate(a.agreementsAt)} tone="secondary" />
          </Section>
        </PixelCard>
      </div>
    </div>
  );
}

/**
 * The applicant's resume, readable without leaving the page (PLAT-30).
 *
 * The <iframe> points at this application's resume route, which mints a fresh
 * signed URL per load — so nothing here holds a credential, and the preview
 * can't go stale.
 *
 * Desktop only. A PDF in an iframe is the browser's built-in viewer, and on
 * mobile Safari in particular that renders as a blank box or a download prompt
 * rather than a document; the links below work everywhere, so phones get those
 * instead of a broken frame.
 *
 * It's Person.resume, not a per-application upload — someone who re-uploaded
 * after applying has one resume, the current one. The upload date is shown so
 * that's visible rather than implied.
 */
function ResumePanel({
  applicationId,
  resume,
}: {
  applicationId: string;
  resume: { fileName: string; uploadedAt: Date } | null;
}) {
  if (!resume) {
    return (
      <p className="text-[12px] leading-[1.7] text-text-faintest">
        None on file. Resumes were required at submission, so this is unexpected &mdash; worth asking
        them for one.
      </p>
    );
  }

  const href = `/admin/applications/${applicationId}/resume`;

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="break-all text-[12px] font-bold text-text-primary">{resume.fileName}</span>
        <span className="text-[11px] text-text-faintest">uploaded {formatDate(resume.uploadedAt)}</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[11px] font-bold tracking-wide text-text-primary"
        >
          OPEN &rarr;
        </a>
        <a
          href={`${href}?download=1`}
          className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[11px] font-bold tracking-wide text-text-muted"
        >
          DOWNLOAD
        </a>
      </div>

      <iframe
        src={href}
        title={`Resume: ${resume.fileName}`}
        className="hidden h-[820px] w-full border-2 border-border-default bg-surface-bg md:block"
      />
    </div>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 px-6 py-7 sm:flex-row sm:gap-9">
      <div className="w-full shrink-0 sm:w-[160px]">
        <div className="mb-2 font-pixel text-[9px] text-accent-pink">{number}</div>
        <div className="text-[13px] font-bold tracking-wide text-text-primary">{title}</div>
      </div>
      {/* min-w-0: without it a long unbroken answer widens this flex column
          past the card — same fix as /apply/status. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="mx-6 h-px bg-text-primary/8" />;
}

import Link from "next/link";
import type { ApplicationStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import { STATUS_STYLE } from "../status";
import { DECISIONS, announcementBlockedReason, needsAnnouncement } from "@/lib/decisions";
import { queueDecisionEmails } from "../actions";

/**
 * The confirm step for sending decisions (PLAT-42).
 *
 * Sending is the one irreversible thing an organizer can do here — 80-odd
 * people read the result and there is no unsend — so it doesn't hang off a
 * one-click button on the list. This page exists to be read first: it names
 * every applicant who would be emailed, grouped by what they'd be told, and
 * the button only queues what's shown.
 *
 * A static segment under /admin/applications, so it shadows [id] for the
 * literal path "send". Application ids are cuids, so nothing is unreachable.
 */

type Row = {
  id: string;
  status: ApplicationStatus;
  person: { firstName: string; lastName: string; email: string };
};

export default async function SendDecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ queued?: string; blocked?: string }>;
}) {
  await requireOrganizer();
  const params = await searchParams;
  const justQueued = params.queued ? Number(params.queued) : null;

  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" } });
  if (!event) {
    return (
      <Shell>
        <p className="text-[13px] text-text-muted">No event exists yet, so there&apos;s nothing to send.</p>
      </Shell>
    );
  }

  const rsvpUrl = process.env.RSVP_URL;

  const decided = await prisma.application.findMany({
    where: { eventId: event.id, status: { not: "SUBMITTED" } },
    orderBy: [{ person: { firstName: "asc" } }],
    select: {
      id: true,
      status: true,
      person: { select: { firstName: true, lastName: true, email: true } },
      emailQueue: { select: { emailType: true, status: true, sentAt: true } },
    },
  });

  const pending: Row[] = [];
  const blocked: { row: Row; reason: string }[] = [];
  let alreadyQueued = 0;

  for (const a of decided) {
    if (a.status === "SUBMITTED") continue;
    if (!needsAnnouncement(a.status, a.emailQueue)) {
      alreadyQueued++;
      continue;
    }
    const reason = announcementBlockedReason(a.status, rsvpUrl);
    if (reason) {
      blocked.push({ row: a, reason });
      continue;
    }
    pending.push(a);
  }

  const byDecision = DECISIONS.map((d) => ({
    decision: d,
    rows: pending.filter((r) => r.status === d),
  })).filter((g) => g.rows.length > 0);

  return (
    <Shell>
      {justQueued !== null && (
        <PixelCard borderColor="var(--color-terminal-green)" className="mb-6 p-5">
          <p className="text-[13px] leading-[1.8] text-text-secondary">
            Queued <strong className="text-text-primary">{justQueued}</strong>{" "}
            {justQueued === 1 ? "email" : "emails"}. Nothing has been sent yet — the scheduler drains
            the queue every 15 minutes. Watch it on{" "}
            <Link href="/admin/email-queue" className="text-accent-pink underline">
              the email queue
            </Link>
            .
          </p>
        </PixelCard>
      )}

      {pending.length === 0 ? (
        <PixelCard className="mb-6 p-6">
          <p className="text-[13px] leading-[1.8] text-text-muted">
            {alreadyQueued > 0
              ? `Nothing left to send — all ${alreadyQueued} decided applicants have had their email queued.`
              : "No decisions to send. Mark some applicants first."}
          </p>
        </PixelCard>
      ) : (
        <PixelCard borderColor="var(--color-accent-pink)" className="mb-6 p-6">
          <span className="font-pixel text-[9px] tracking-widest text-accent-pink">// READY TO SEND</span>
          <p className="mt-3.5 mb-5 text-[13px] leading-[1.8] text-text-secondary">
            This queues <strong className="text-text-primary">{pending.length}</strong>{" "}
            {pending.length === 1 ? "email" : "emails"} to real applicants. There is no unsend.
          </p>

          <div className="mb-6 flex flex-col gap-5">
            {byDecision.map(({ decision, rows }) => (
              <div key={decision}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <PixelChip color={STATUS_STYLE[decision].color}>{STATUS_STYLE[decision].label}</PixelChip>
                  <span className="text-[12px] text-text-muted">
                    {rows.length} {rows.length === 1 ? "person" : "people"}
                  </span>
                </div>
                <ul className="flex flex-col gap-1 border-l-2 border-border-default pl-3.5">
                  {rows.map((r) => (
                    <li key={r.id} className="text-[12px] leading-[1.7]">
                      <Link href={`/admin/applications/${r.id}`} className="text-text-secondary hover:text-accent-pink">
                        {r.person.firstName} {r.person.lastName}
                      </Link>
                      <span className="text-text-faintest"> · {r.person.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <form action={queueDecisionEmails}>
            <input type="hidden" name="returnTo" value="/admin/applications/send" />
            <button
              type="submit"
              className="pixel-btn-solid px-5 py-3 font-body text-[12px] font-bold tracking-wide text-surface-bg"
            >
              QUEUE {pending.length} {pending.length === 1 ? "EMAIL" : "EMAILS"}
            </button>
          </form>
        </PixelCard>
      )}

      {blocked.length > 0 && (
        <PixelCard borderColor="var(--color-accent-amber)" className="mb-6 p-6">
          <span className="font-pixel text-[9px] tracking-widest text-accent-amber">// HELD BACK</span>
          <p className="mt-3.5 text-[13px] leading-[1.8] text-text-secondary">
            {blocked.length} {blocked.length === 1 ? "applicant is" : "applicants are"} decided but
            can&apos;t be emailed yet: {blocked[0].reason}.
          </p>
          <p className="mt-2.5 text-[12px] leading-[1.7] text-text-muted">
            They&apos;ll be included here the moment that&apos;s set — no code change needed. Everyone
            else can go out now.
          </p>
          <details className="mt-3.5">
            <summary className="cursor-pointer text-[12px] text-text-muted hover:text-accent-pink">
              Who&apos;s waiting
            </summary>
            <ul className="mt-2.5 flex flex-col gap-1 border-l-2 border-border-default pl-3.5">
              {blocked.map(({ row }) => (
                <li key={row.id} className="text-[12px] leading-[1.7]">
                  <Link href={`/admin/applications/${row.id}`} className="text-text-secondary hover:text-accent-pink">
                    {row.person.firstName} {row.person.lastName}
                  </Link>
                  <span className="text-text-faintest"> · {row.person.email}</span>
                </li>
              ))}
            </ul>
          </details>
        </PixelCard>
      )}

      {alreadyQueued > 0 && (
        <p className="text-[11px] text-text-faintest">
          {alreadyQueued} decided {alreadyQueued === 1 ? "applicant has" : "applicants have"} already
          had their email queued and {alreadyQueued === 1 ? "is" : "are"} not listed above.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[860px]">
        <Link
          href="/admin/applications"
          className="mb-6 inline-block text-[12px] text-text-muted hover:text-accent-pink"
        >
          &larr; All applications
        </Link>
        <h1 className="mb-2 font-pixel text-lg leading-[1.7] text-text-primary">SEND DECISIONS</h1>
        <p className="mb-7 text-[13px] text-text-muted">
          Queue the accept / waitlist / reject emails for everyone who&apos;s been decided.
        </p>
        {children}
      </div>
    </div>
  );
}

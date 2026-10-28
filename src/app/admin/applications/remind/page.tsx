import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import PixelCard from "@/components/ui/PixelCard";
import { RSVP_LABEL } from "../status";
import { needsMlhReminder } from "@/lib/reminders";
import { queueMlhReminders } from "../actions";

/**
 * The confirm step for the MLH registration reminder (PLAT-26).
 *
 * Same contract as /admin/applications/send: it names everyone who would be
 * emailed before anything is queued. The form also submits how many it listed,
 * and the action refuses if that number has moved — so the button can't
 * quietly email people whose names were never on screen. One batch, once, and
 * nobody gets a second reminder, so a widened scope isn't recoverable.
 *
 * Deliberately not scheduled. "Seven days before startDate" needs a route, a
 * secret and scheduler config, and when it's wrong it either double-sends or
 * silently never fires — which nobody notices until the week is gone.
 */

function formatEventDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

function daysUntil(d: Date) {
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export default async function RemindPage({
  searchParams,
}: {
  searchParams: Promise<{ queued?: string; changed?: string }>;
}) {
  await requireOrganizer();
  const { queued, changed } = await searchParams;
  const asCount = (raw: string | undefined) => {
    const n = Number(raw);
    return raw !== undefined && Number.isInteger(n) && n >= 0 ? n : null;
  };
  const justQueued = asCount(queued);
  const listChanged = asCount(changed);

  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" } });
  if (!event) {
    return (
      <Shell>
        <p className="text-[13px] text-text-muted">No event exists yet.</p>
      </Shell>
    );
  }

  const [accepted, undecided] = await Promise.all([
    prisma.application.findMany({
      where: { eventId: event.id, status: "ACCEPTED" },
      orderBy: [{ person: { firstName: "asc" } }],
      select: {
        id: true,
        status: true,
        source: true,
        rsvpStatus: true,
        person: { select: { firstName: true, lastName: true, email: true } },
        emailQueue: { select: { emailType: true, status: true } },
      },
    }),
    prisma.application.count({ where: { eventId: event.id, status: "SUBMITTED" } }),
  ]);

  // pending + covered partition the eligible set; declined and walk-ins sit
  // outside it entirely. Counting them together is how the "all 0 hackers have
  // had their reminder" nonsense happens.
  const eligible = accepted.filter((a) => a.source !== "WALK_IN" && a.rsvpStatus !== "DECLINED");
  const pending = eligible.filter((a) => needsMlhReminder(a));
  const covered = eligible.length - pending.length;
  const declined = accepted.filter((a) => a.rsvpStatus === "DECLINED").length;
  const walkIns = accepted.filter((a) => a.source === "WALK_IN").length;
  // A FAILED reminder makes this page say "done" while that person got
  // nothing, so it's named rather than left to be noticed.
  const failed = accepted.filter((a) =>
    a.emailQueue.some((e) => e.emailType === "MLH_REMINDER" && e.status === "FAILED"),
  ).length;

  const days = daysUntil(event.startDate);

  return (
    <Shell>
      <PixelCard className="mb-6 p-5">
        <p className="text-[13px] leading-[1.8] text-text-secondary">
          {event.name} is <strong className="text-text-primary">{formatEventDate(event.startDate)}</strong>
          {days > 0 ? ` — ${days} ${days === 1 ? "day" : "days"} away.` : "."}
        </p>
        <p className="mt-2.5 text-[12px] leading-[1.7] text-text-muted">
          MLH registration happens in MLH&apos;s own system, so we can&apos;t tell who&apos;s
          finished it. This goes to everyone who&apos;s coming and says to ignore it if
          it&apos;s already done.
        </p>
      </PixelCard>

      {listChanged !== null && (
        <PixelCard borderColor="var(--color-terminal-red)" className="mb-6 p-5">
          <p className="text-[13px] leading-[1.8] text-text-secondary">
            Nothing was sent. The list changed while this page was open &mdash; it&apos;s now{" "}
            <strong className="text-text-primary">{listChanged}</strong>{" "}
            {listChanged === 1 ? "person" : "people"}. Read it again below, then send.
          </p>
        </PixelCard>
      )}

      {justQueued !== null && (
        <PixelCard borderColor="var(--color-terminal-green)" className="mb-6 p-5">
          <p className="text-[13px] leading-[1.8] text-text-secondary">
            Queued <strong className="text-text-primary">{justQueued}</strong>{" "}
            {justQueued === 1 ? "reminder" : "reminders"}. The scheduler drains the queue every
            15 minutes; past 100 in a day it spreads across days rather than failing. Follow it on{" "}
            <Link href="/admin/email-queue" className="text-accent-pink underline">
              the email queue
            </Link>
            .
          </p>
        </PixelCard>
      )}

      {undecided > 0 && pending.length > 0 && (
        <PixelCard borderColor="var(--color-accent-amber)" className="mb-6 p-5">
          <p className="text-[13px] leading-[1.8] text-text-secondary">
            <strong className="text-text-primary">{undecided}</strong> applications are still
            undecided.
          </p>
          <p className="mt-2.5 text-[12px] leading-[1.7] text-text-muted">
            Everyone gets exactly one reminder, so anyone accepted after this send needs a second
            batch. If the decision pass isn&apos;t finished, it&apos;s worth waiting.
          </p>
        </PixelCard>
      )}

      {pending.length === 0 ? (
        <PixelCard className="mb-6 p-6">
          <p className="text-[13px] leading-[1.8] text-text-muted">
            {accepted.length === 0
              ? "Nobody is accepted yet, so there's nobody to remind. Decide some applications first."
              : eligible.length === 0
                ? "Nobody is eligible for a reminder — every accepted hacker either declined or was registered at the door."
                : `Nothing to send — all ${eligible.length} eligible ${eligible.length === 1 ? "hacker has" : "hackers have"} had their reminder queued.`}
          </p>
        </PixelCard>
      ) : (
        <PixelCard borderColor="var(--color-accent-amber)" className="mb-6 p-6">
          <span className="font-pixel text-[9px] tracking-widest text-accent-amber">// READY TO REMIND</span>
          <p className="mt-3.5 mb-5 text-[13px] leading-[1.8] text-text-secondary">
            This queues <strong className="text-text-primary">{pending.length}</strong>{" "}
            {pending.length === 1 ? "email" : "emails"} to accepted hackers. Each person gets one
            reminder, so there&apos;s no second pass.
          </p>

          <ul className="mb-6 flex flex-col gap-1 border-l-2 border-border-default pl-3.5">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2 text-[12px] leading-[1.8]">
                <Link href={`/admin/applications/${a.id}`} className="text-text-secondary hover:text-accent-pink">
                  {a.person.firstName} {a.person.lastName}
                </Link>
                <span className="text-text-faintest">{a.person.email}</span>
                {/* RSVP_LABEL.PENDING is already "RSVP PENDING" — don't prefix it. */}
                <span className="text-[10px] uppercase tracking-wider text-text-faintest">
                  {RSVP_LABEL[a.rsvpStatus].toLowerCase()}
                </span>
              </li>
            ))}
          </ul>

          <form action={queueMlhReminders}>
            <input type="hidden" name="returnTo" value="/admin/applications/remind" />
            {/* What the action checks before queueing anything — see queueMlhReminders. */}
            <input type="hidden" name="expected" value={pending.length} />
            <button
              type="submit"
              className="pixel-btn-solid px-5 py-3 font-body text-[12px] font-bold tracking-wide text-surface-bg"
            >
              QUEUE {pending.length} {pending.length === 1 ? "REMINDER" : "REMINDERS"}
            </button>
          </form>
        </PixelCard>
      )}

      {(covered > 0 || declined > 0 || walkIns > 0 || failed > 0) && (
        <p className="text-[11px] leading-[1.7] text-text-faintest">
          {covered > 0 && <>{covered} already reminded. </>}
          {declined > 0 && <>{declined} declined their RSVP. </>}
          {walkIns > 0 && <>{walkIns} registered at the door. </>}
          {failed > 0 && (
            <>
              {failed} reminder{failed === 1 ? "" : "s"} failed to send &mdash; retry{" "}
              <Link href="/admin/email-queue" className="text-accent-pink underline">
                on the email queue
              </Link>
              .
            </>
          )}
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
        <h1 className="mb-2 font-pixel text-lg leading-[1.7] text-text-primary">MLH REMINDER</h1>
        <p className="mb-7 text-[13px] text-text-muted">
          The week-before nudge to finish MLH registration.
        </p>
        {children}
      </div>
    </div>
  );
}

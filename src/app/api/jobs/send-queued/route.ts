import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { issueRsvpToken, resolveRsvpToken } from "@/lib/rsvp";
import { getRsvpBaseUrl } from "@/lib/site-url";
import ConfirmationEmail from "@emails/ConfirmationEmail";
import AcceptedEmail from "@emails/AcceptedEmail";
import WaitlistedEmail from "@emails/WaitlistedEmail";
import RejectedEmail from "@emails/RejectedEmail";
import type { EmailType } from "@/generated/prisma/client";

/**
 * Drains the EmailQueue (PLAT-23 follow-up). Not a Vercel cron — Hobby caps
 * cron jobs at once/day each, far too infrequent to work through a queue
 * that needs to drain against Resend's 100/day free-tier cap without
 * dropping a launch-day spike. This is called by an external scheduler
 * (cron-job.org) every 15 minutes instead — see the PR description for the
 * exact config.
 */

const DEFAULT_BATCH_SIZE = 20;
const MAX_ATTEMPTS = 3;
// Resend's default rate limit is ~2 requests/second; this keeps a batch
// comfortably under that without needing to catch that error case too.
const DELAY_BETWEEN_SENDS_MS = 500;
const STALE_ACCEPTANCE_ERROR = "Acceptance email not sent: the application or RSVP invitation is no longer eligible. Review the decision before retrying.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resend's daily/monthly cap and its per-second rate limit are the account
 * hitting a ceiling, not this particular email being bad — retrying the
 * same row later (without burning one of its 3 attempts) is the right
 * response, unlike a real send failure (bad address, Resend outage).
 *
 * The SDK doesn't export its error type, so this checks structurally
 * rather than importing something that isn't public.
 */
function isRateOrQuotaError(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name;
  return (
    name === "rate_limit_exceeded" || name === "daily_quota_exceeded" || name === "monthly_quota_exceeded"
  );
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message;
  return String(e);
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const batchSize = Number(process.env.EMAIL_BATCH_SIZE) || DEFAULT_BATCH_SIZE;

  // Atomically claim the oldest PENDING rows in one statement. A plain
  // "SELECT PENDING rows, then send, then UPDATE" has a race between the
  // select and the update — two overlapping invocations (a scheduler retry,
  // two runs overlapping under load) could both select the same row before
  // either marks it. FOR UPDATE SKIP LOCKED inside the subquery means a
  // second concurrent claim just skips rows the first one already grabbed,
  // instead of blocking on or double-claiming them.
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "EmailQueue"
    SET status = 'SENDING'
    WHERE id IN (
      SELECT id FROM "EmailQueue"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;

  if (claimed.length === 0) {
    const remaining = await prisma.emailQueue.count({ where: { status: "PENDING" } });
    return NextResponse.json({ attempted: 0, sent: 0, failed: 0, remaining });
  }

  const rows = await prisma.emailQueue.findMany({
    where: { id: { in: claimed.map((row) => row.id) } },
    include: { application: { include: { person: true, event: true } } },
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const outcome = await sendOne(row.emailType, row.application);
      await prisma.emailQueue.update({
        where: { id: row.id },
        // lastError is cleared here, not just left from a prior failed
        // attempt — a SENT row carrying an old error reads as broken when
        // someone's actually looking at the raw data later.
        // FAILED is also the existing organizer-review state. A stale decision
        // must not be retried automatically or marked SENT; no attempt is used.
        data: outcome === "STALE_ACCEPTANCE"
          ? { status: "FAILED", sentAt: null, lastError: STALE_ACCEPTANCE_ERROR }
          : { status: "SENT", sentAt: new Date(), lastError: null },
      });
      if (outcome === "STALE_ACCEPTANCE") failed++;
      else sent++;
    } catch (e) {
      const rateOrQuota = isRateOrQuotaError(e);
      // A renderer/provider exception can echo its payload, including the raw
      // RSVP URL. Neither logs nor lastError may retain that acceptance payload.
      const message = row.emailType === "ACCEPTED"
        ? rateOrQuota
          ? "Email provider rate limit or quota reached; retry later."
          : "ACCEPTED email could not be sent. Check RSVP_URL/email configuration and retry."
        : errorMessage(e);
      // An old in-flight request may fail after withdrawal/re-acceptance. Its
      // automatic retry must not silently invite someone into the new cycle.
      if (row.emailType === "ACCEPTED" && (!row.application || !(await isStillAccepted(row.application)))) {
        await prisma.emailQueue.update({
          where: { id: row.id },
          data: {
            status: "FAILED", sentAt: null, lastError: STALE_ACCEPTANCE_ERROR,
            attempts: row.attempts + (rateOrQuota ? 0 : 1),
          },
        });
      } else if (rateOrQuota) {
        // The account-level cap, not this email — back to PENDING, attempts
        // untouched, so it's retried on a later run without ever reaching
        // FAILED just because launch day was busy.
        await prisma.emailQueue.update({
          where: { id: row.id },
          data: { status: "PENDING", lastError: message },
        });
      } else {
        const attempts = row.attempts + 1;
        await prisma.emailQueue.update({
          where: { id: row.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
            attempts,
            lastError: message,
          },
        });
      }
      failed++;
      console.error("[send-queued]", row.id, row.emailType, message);
    }

    await sleep(DELAY_BETWEEN_SENDS_MS);
  }

  const remaining = await prisma.emailQueue.count({ where: { status: "PENDING" } });
  return NextResponse.json({ attempted: rows.length, sent, failed, remaining });
}

/**
 * One dispatch point per EmailType. The queue/claim/retry machinery above is
 * generic, so a new type is just another case here and another value in the
 * enum, not a second queue or route.
 */
type ApplicationWithRelations = {
  id: string;
  decidedAt: Date | null;
  person: { firstName: string; email: string };
  event: { name: string; organizerHqUrl: string };
};

async function isStillAccepted(expected: ApplicationWithRelations): Promise<boolean> {
  const application = await prisma.application.findUnique({
    where: { id: expected.id }, select: { status: true, decidedAt: true },
  });
  return application?.status === "ACCEPTED" &&
    (application.decidedAt?.getTime() ?? null) === (expected.decidedAt?.getTime() ?? null);
}

async function sendOne(
  emailType: EmailType,
  application: ApplicationWithRelations | null,
): Promise<"SENT" | "STALE_ACCEPTANCE"> {
  if (!application) {
    if (emailType === "ACCEPTED") return "STALE_ACCEPTANCE";
    throw new Error("Application missing for queued email");
  }
  const { person, event } = application;

  switch (emailType) {
    case "CONFIRMATION":
      await sendEmail({
        to: person.email,
        subject: "You're on the list — HackJam '26",
        react: ConfirmationEmail({
          firstName: person.firstName,
          organizerHqUrl: event.organizerHqUrl,
        }),
      });
      return "SENT";
    case "ACCEPTED": {
      // The included relation is a batch snapshot. Re-read the decision before
      // issuing anything; the issuer also checks ACCEPTED under its row lock.
      if (!(await isStillAccepted(application))) return "STALE_ACCEPTANCE";
      const baseUrl = getRsvpBaseUrl(process.env.RSVP_URL);
      let rawToken: string;
      try {
        rawToken = await issueRsvpToken(application.id);
      } catch (error) {
        if (!(await isStillAccepted(application))) return "STALE_ACCEPTANCE";
        throw error;
      }
      const rsvpUrl = `${baseUrl}/${encodeURIComponent(rawToken)}`;
      const message = {
        to: person.email,
        subject: `You're in — ${event.name}`,
        react: AcceptedEmail({
          firstName: person.firstName,
          eventName: event.name,
          rsvpUrl,
          organizerHqUrl: event.organizerHqUrl,
        }),
      };
      if (!(await isStillAccepted(application)) || (await resolveRsvpToken(rawToken)).status !== "VALID") {
        return "STALE_ACCEPTANCE";
      }

      // Issuance has committed before this external call. A provider rejection
      // (including rate/quota errors, only known after calling it) or ambiguous
      // delivery leaves the token valid. A retry may safely issue another one.
      await sendEmail(message);
      return "SENT";
    }
    case "WAITLISTED":
      await sendEmail({
        to: person.email,
        subject: `You're on the waitlist — ${event.name}`,
        react: WaitlistedEmail({ firstName: person.firstName, eventName: event.name }),
      });
      return "SENT";
    case "REJECTED":
      await sendEmail({
        to: person.email,
        subject: `Your ${event.name} application`,
        react: RejectedEmail({ firstName: person.firstName, eventName: event.name }),
      });
      return "SENT";
    default: {
      // Exhaustiveness check: a new EmailType with no case here is a
      // compile error, not a row silently stuck at SENDING forever.
      const exhaustive: never = emailType;
      throw new Error(`no sender for email type: ${exhaustive}`);
    }
  }
}

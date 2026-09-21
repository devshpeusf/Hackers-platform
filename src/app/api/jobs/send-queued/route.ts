import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import ConfirmationEmail from "@emails/ConfirmationEmail";
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
      await sendOne(row.emailType, row.application);
      await prisma.emailQueue.update({
        where: { id: row.id },
        // lastError is cleared here, not just left from a prior failed
        // attempt — a SENT row carrying an old error reads as broken when
        // someone's actually looking at the raw data later.
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      sent++;
    } catch (e) {
      if (isRateOrQuotaError(e)) {
        // The account-level cap, not this email — back to PENDING, attempts
        // untouched, so it's retried on a later run without ever reaching
        // FAILED just because launch day was busy.
        await prisma.emailQueue.update({
          where: { id: row.id },
          data: { status: "PENDING", lastError: errorMessage(e) },
        });
      } else {
        const attempts = row.attempts + 1;
        await prisma.emailQueue.update({
          where: { id: row.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
            attempts,
            lastError: errorMessage(e),
          },
        });
      }
      failed++;
      console.error("[send-queued]", row.id, row.emailType, e);
    }

    await sleep(DELAY_BETWEEN_SENDS_MS);
  }

  const remaining = await prisma.emailQueue.count({ where: { status: "PENDING" } });
  return NextResponse.json({ attempted: rows.length, sent, failed, remaining });
}

/**
 * One dispatch point per EmailType — CONFIRMATION is the only one that
 * exists today, but the queue/claim/retry machinery above is generic, so
 * adding a second type later (a reminder, a decision email) is just another
 * case here and another value in the enum, not a second queue or route.
 */
type ApplicationWithRelations = {
  person: { firstName: string; email: string };
  event: { organizerHqUrl: string };
};

async function sendOne(emailType: EmailType, application: ApplicationWithRelations) {
  switch (emailType) {
    case "CONFIRMATION":
      await sendEmail({
        to: application.person.email,
        subject: "You're on the list — HackJam '26",
        react: ConfirmationEmail({
          firstName: application.person.firstName,
          organizerHqUrl: application.event.organizerHqUrl,
        }),
      });
      return;
    default: {
      // Exhaustiveness check: a new EmailType with no case here is a
      // compile error, not a row silently stuck at SENDING forever.
      const exhaustive: never = emailType;
      throw new Error(`no sender for email type: ${exhaustive}`);
    }
  }
}

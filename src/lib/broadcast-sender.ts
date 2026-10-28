import "server-only";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import AnnouncementEmail from "@emails/AnnouncementEmail";

/**
 * Sends queued announcement emails (BroadcastRecipient rows). Called by the
 * scheduled send job with whatever batch room is left after transactional
 * email, so announcements never delay a confirmation, decision or RSVP link
 * on Resend's free-tier daily cap.
 *
 * Same rules as the EmailQueue loop: claim rows atomically (FOR UPDATE SKIP
 * LOCKED) so overlapping runs can't double-send; real failures count toward
 * MAX_ATTEMPTS; a rate-limit/quota response isn't the email's fault, so it
 * doesn't count — and it stops this run, releasing the rest of the batch.
 */

const MAX_ATTEMPTS = 3;
const DELAY_BETWEEN_SENDS_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateOrQuotaError(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name;
  return name === "rate_limit_exceeded" || name === "daily_quota_exceeded" || name === "monthly_quota_exceeded";
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 500);
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message.slice(0, 500);
  return String(e).slice(0, 500);
}

export type BroadcastBatchResult = { attempted: number; sent: number; failed: number; remaining: number; quotaHit: boolean };

export async function sendBroadcastBatch(limit: number): Promise<BroadcastBatchResult> {
  const remaining = () => prisma.broadcastRecipient.count({ where: { status: "PENDING" } });
  if (limit <= 0) return { attempted: 0, sent: 0, failed: 0, remaining: await remaining(), quotaHit: false };

  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "BroadcastRecipient"
    SET status = 'SENDING'
    WHERE id IN (
      SELECT id FROM "BroadcastRecipient"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  if (claimed.length === 0) return { attempted: 0, sent: 0, failed: 0, remaining: await remaining(), quotaHit: false };

  const rows = await prisma.broadcastRecipient.findMany({
    where: { id: { in: claimed.map((r) => r.id) } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      attempts: true,
      broadcast: { select: { subject: true, body: true, event: { select: { name: true } } } },
      application: { select: { person: { select: { firstName: true, email: true } } } },
    },
  });

  let sent = 0;
  let failed = 0;
  let attempted = 0;
  let quotaHit = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    attempted++;
    try {
      await sendEmail({
        to: row.application.person.email,
        subject: row.broadcast.subject,
        react: AnnouncementEmail({
          firstName: row.application.person.firstName,
          eventName: row.broadcast.event.name,
          subject: row.broadcast.subject,
          body: row.broadcast.body,
        }),
      });
      await prisma.broadcastRecipient.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      sent++;
    } catch (e) {
      if (isRateOrQuotaError(e)) {
        // The account cap, not this email: back to PENDING without using an
        // attempt, and release the rest of this batch for a later run.
        const release = rows.slice(i).map((r) => r.id);
        await prisma.broadcastRecipient.updateMany({
          where: { id: { in: release } },
          data: { status: "PENDING", lastError: "Email provider rate limit or quota reached; retry later." },
        });
        quotaHit = true;
        break;
      }
      const attempts = row.attempts + 1;
      await prisma.broadcastRecipient.update({
        where: { id: row.id },
        data: { status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", attempts, lastError: errorMessage(e) },
      });
      failed++;
      console.error("[send-queued] broadcast", row.id, errorMessage(e));
    }
    await sleep(DELAY_BETWEEN_SENDS_MS);
  }

  return { attempted, sent, failed, remaining: await remaining(), quotaHit };
}

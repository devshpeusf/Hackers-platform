import "server-only";

import { prisma } from "@/lib/prisma";
import type { BroadcastAudience, Prisma } from "@/generated/prisma/client";

/**
 * Announcements to groups of hackers (/admin/email): who each audience is,
 * and creating a broadcast. Sending happens later, in the scheduled job
 * (src/lib/broadcast-sender.ts), after transactional email.
 *
 * Recipients are always resolved here, on the server, from the audience —
 * there's no way to supply addresses. Everything is scoped to the current
 * event (the most recent, same as the rest of /admin).
 */

export const AUDIENCES: Record<BroadcastAudience, { label: string; description: string; where: Prisma.ApplicationWhereInput }> = {
  ACCEPTED_ALL: {
    label: "All accepted",
    description: "Everyone accepted who hasn't declined.",
    where: { status: "ACCEPTED", rsvpStatus: { in: ["PENDING", "CONFIRMED"] } },
  },
  ACCEPTED_CONFIRMED: {
    label: "Accepted · confirmed",
    description: "Accepted and RSVP'd yes.",
    where: { status: "ACCEPTED", rsvpStatus: "CONFIRMED" },
  },
  ACCEPTED_PENDING_RSVP: {
    label: "Accepted · haven't RSVP'd",
    description: "Accepted but haven't answered yet. Good for RSVP reminders.",
    where: { status: "ACCEPTED", rsvpStatus: "PENDING" },
  },
  WAITLISTED: {
    label: "Waitlisted",
    description: "Everyone on the waitlist.",
    where: { status: "WAITLISTED" },
  },
  ALL_APPLICANTS: {
    label: "All applicants",
    description: "Everyone who applied, whatever their status.",
    where: {},
  },
  WALK_INS: {
    label: "Walk-ins",
    description: "People registered at the door.",
    where: { source: "WALK_IN" },
  },
  ON_A_TEAM: {
    label: "On a team",
    description: "Accepted hackers who are on a team.",
    where: { teamId: { not: null }, status: "ACCEPTED", rsvpStatus: { in: ["PENDING", "CONFIRMED"] } },
  },
};

export const AUDIENCE_KEYS = Object.keys(AUDIENCES) as BroadcastAudience[];

export function parseAudience(raw: unknown): BroadcastAudience | null {
  return typeof raw === "string" && (AUDIENCE_KEYS as string[]).includes(raw) ? (raw as BroadcastAudience) : null;
}

async function currentEventId(): Promise<string | null> {
  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" }, select: { id: true } });
  return event?.id ?? null;
}

/** How many people each audience reaches right now, for the compose page. */
export async function audienceCounts(): Promise<Record<BroadcastAudience, number>> {
  const eventId = await currentEventId();
  const counts = await Promise.all(
    AUDIENCE_KEYS.map((key) =>
      eventId ? prisma.application.count({ where: { eventId, ...AUDIENCES[key].where } }) : Promise.resolve(0),
    ),
  );
  return Object.fromEntries(AUDIENCE_KEYS.map((key, i) => [key, counts[i]])) as Record<BroadcastAudience, number>;
}

/**
 * Records the broadcast and snapshots its recipients in one transaction, so
 * who gets it is fixed at the moment it's sent — someone accepted a minute
 * later isn't added to an announcement they weren't meant for.
 */
export async function createBroadcast(input: {
  sentById: string;
  audience: BroadcastAudience;
  subject: string;
  body: string;
}): Promise<{ ok: true; recipients: number } | { ok: false; message: string }> {
  const eventId = await currentEventId();
  if (!eventId) return { ok: false, message: "There's no event to send for." };

  return prisma.$transaction(async (tx) => {
    const applications = await tx.application.findMany({
      where: { eventId, ...AUDIENCES[input.audience].where },
      select: { id: true },
    });
    if (applications.length === 0) return { ok: false as const, message: "Nobody is in that group right now." };

    const broadcast = await tx.broadcast.create({
      data: { eventId, audience: input.audience, subject: input.subject, body: input.body, sentById: input.sentById },
      select: { id: true },
    });
    await tx.broadcastRecipient.createMany({
      data: applications.map((a) => ({ broadcastId: broadcast.id, applicationId: a.id })),
      skipDuplicates: true,
    });
    return { ok: true as const, recipients: applications.length };
  });
}

export type BroadcastSummary = {
  id: string;
  createdAt: Date;
  subject: string;
  audience: string;
  sentBy: string;
  total: number;
  sent: number;
  pending: number;
  failed: number;
};

/** Past announcements with delivery counts, newest first. */
export async function listBroadcasts(): Promise<BroadcastSummary[]> {
  const eventId = await currentEventId();
  if (!eventId) return [];
  const broadcasts = await prisma.broadcast.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      subject: true,
      audience: true,
      sentBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!broadcasts.length) return [];

  const grouped = await prisma.broadcastRecipient.groupBy({
    by: ["broadcastId", "status"],
    where: { broadcastId: { in: broadcasts.map((b) => b.id) } },
    _count: { _all: true },
  });

  return broadcasts.map((b) => {
    const rows = grouped.filter((g) => g.broadcastId === b.id);
    const n = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r._count._all, 0);
    return {
      id: b.id,
      createdAt: b.createdAt,
      subject: b.subject,
      audience: AUDIENCES[b.audience].label,
      sentBy: `${b.sentBy.firstName} ${b.sentBy.lastName}`.trim(),
      total: n(["PENDING", "SENDING", "SENT", "FAILED"]),
      sent: n(["SENT"]),
      pending: n(["PENDING", "SENDING"]),
      failed: n(["FAILED"]),
    };
  });
}

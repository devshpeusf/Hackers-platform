import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { evaluateScan, looksLikeBadgeToken, type BlockReason, type ScanTarget, type ScanWarning } from "@/lib/scan-rules";

/**
 * Badge scanning (/admin/check-in): check-in at the door, then meals and
 * workshops. The rules live in src/lib/scan-rules.ts; this file loads the
 * hacker, applies them and records the scan.
 *
 * Every scan is recorded at most once, enforced by the database rather than
 * by reading first: check-in is a conditional update (only while checkedInAt
 * is empty) and meals/workshops have a unique (checkpoint, application) pair.
 * So two volunteers scanning the same badge at the same moment get one
 * success and one "already scanned", never two.
 */

/** Same "current event" as the rest of /admin: the most recent. */
export async function currentEvent() {
  return prisma.event.findFirst({ orderBy: { startDate: "desc" }, select: { id: true, name: true } });
}

/** "CHECK_IN", or the id of one of the current event's checkpoints. */
export type ScanMode = string;

export type ScanHacker = {
  name: string;
  discordUsername: string | null;
  school: string;
  /** Meals only ("" = nothing listed); null for check-in and workshops. */
  diet: string | null;
};

export type ScanResult =
  | { outcome: "blocked"; reason: BlockReason; hacker: ScanHacker | null; previous: { at: string; by: string } | null }
  | { outcome: "ok" | "warning"; warnings: ScanWarning[]; hacker: ScanHacker }
  | { outcome: "error"; message: string };

const APPLICATION_SELECT = {
  id: true,
  eventId: true,
  status: true,
  rsvpStatus: true,
  isMinor: true,
  checkedInAt: true,
  checkedInBy: { select: { firstName: true } },
  school: true,
  diet: true,
  person: { select: { firstName: true, lastName: true, discordUsername: true } },
} satisfies Prisma.ApplicationSelect;

type Loaded = Prisma.ApplicationGetPayload<{ select: typeof APPLICATION_SELECT }>;

function hackerOf(app: Loaded, target: ScanTarget): ScanHacker {
  return {
    name: `${app.person.firstName} ${app.person.lastName}`.trim(),
    discordUsername: app.person.discordUsername,
    school: app.school,
    diet: target === "MEAL" ? (app.diet?.trim() ?? "") : null,
  };
}

/**
 * Scans one hacker, found by their badge's QR text or (from name search) by
 * application id. `staffId` is the scanning volunteer's Person id, already
 * verified by the caller.
 */
export async function scan(input: { mode: ScanMode; badge?: string; applicationId?: string; staffId: string }): Promise<ScanResult> {
  const event = await currentEvent();
  if (!event) return { outcome: "error", message: "There's no event set up." };

  let target: ScanTarget = "CHECK_IN";
  let checkpointId: string | null = null;
  if (input.mode !== "CHECK_IN") {
    const checkpoint = await prisma.checkpoint.findFirst({
      where: { id: input.mode, eventId: event.id },
      select: { id: true, kind: true },
    });
    if (!checkpoint) return { outcome: "error", message: "That meal or workshop no longer exists. Pick another." };
    target = checkpoint.kind;
    checkpointId = checkpoint.id;
  }

  // Whatever the camera read: trim it, and refuse anything that can't be a
  // badge before it reaches the database.
  const badge = input.badge?.trim();
  let app: Loaded | null = null;
  if (badge !== undefined) {
    if (looksLikeBadgeToken(badge)) {
      app = await prisma.application.findUnique({ where: { badgeToken: badge }, select: APPLICATION_SELECT });
    }
  } else if (input.applicationId) {
    app = await prisma.application.findUnique({ where: { id: input.applicationId }, select: APPLICATION_SELECT });
  }

  const existing = app && checkpointId ? await previousScan(checkpointId, app.id) : null;
  const alreadyAt = target === "CHECK_IN" ? (app?.checkedInAt ?? null) : (existing?.createdAt ?? null);

  const verdict = evaluateScan(
    target,
    app && {
      sameEvent: app.eventId === event.id,
      status: app.status,
      rsvpStatus: app.rsvpStatus,
      isMinor: app.isMinor,
      checkedInAt: app.checkedInAt,
      alreadyAt,
    },
  );

  if (verdict.outcome === "blocked") {
    const previous =
      verdict.reason === "already_scanned" && app
        ? target === "CHECK_IN"
          ? stamp(app.checkedInAt, app.checkedInBy?.firstName)
          : stamp(existing?.createdAt ?? null, existing?.scannedBy.firstName)
        : null;
    // Only name someone the volunteer is allowed to act on: an unknown or
    // other-event badge reveals nothing about whose it is.
    const showHacker = app && verdict.reason !== "unknown" && verdict.reason !== "other_event";
    return { outcome: "blocked", reason: verdict.reason, hacker: showHacker ? hackerOf(app!, target) : null, previous };
  }

  // Passed the rules: record it. If someone else recorded it in between, the
  // database refuses, and this becomes "already scanned".
  const hacker = hackerOf(app!, target);
  if (target === "CHECK_IN") {
    const { count } = await prisma.application.updateMany({
      where: { id: app!.id, checkedInAt: null },
      data: { checkedInAt: new Date(), checkedInById: input.staffId },
    });
    if (count === 0) {
      const fresh = await prisma.application.findUnique({
        where: { id: app!.id },
        select: { checkedInAt: true, checkedInBy: { select: { firstName: true } } },
      });
      return { outcome: "blocked", reason: "already_scanned", hacker, previous: stamp(fresh?.checkedInAt ?? null, fresh?.checkedInBy?.firstName) };
    }
  } else {
    try {
      await prisma.scan.create({ data: { checkpointId: checkpointId!, applicationId: app!.id, scannedById: input.staffId } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      const fresh = await previousScan(checkpointId!, app!.id);
      return { outcome: "blocked", reason: "already_scanned", hacker, previous: stamp(fresh?.createdAt ?? null, fresh?.scannedBy.firstName) };
    }
  }

  return { outcome: verdict.outcome, warnings: verdict.warnings, hacker };
}

function previousScan(checkpointId: string, applicationId: string) {
  return prisma.scan.findUnique({
    where: { checkpointId_applicationId: { checkpointId, applicationId } },
    select: { createdAt: true, scannedBy: { select: { firstName: true } } },
  });
}

function stamp(at: Date | null, by: string | undefined) {
  return at ? { at: at.toISOString(), by: by ?? "someone" } : null;
}

export type HackerMatch = { applicationId: string; name: string; discordUsername: string | null; school: string; checkedIn: boolean };

/**
 * Name search, for a dead phone or a QR that won't scan. Only admitted
 * hackers of the current event (accepted, not declined); at least two
 * characters, at most 8 results.
 */
export async function searchHackers(query: string): Promise<HackerMatch[]> {
  const q = query.trim().replace(/^@/, "");
  if (q.length < 2) return [];
  const event = await currentEvent();
  if (!event) return [];

  const words = q.split(/\s+/).slice(0, 3);
  const rows = await prisma.application.findMany({
    where: {
      eventId: event.id,
      status: "ACCEPTED",
      rsvpStatus: { not: "DECLINED" },
      // Every word has to match some part of their name, handle or email:
      // "ana gar" finds Ana Garcia.
      AND: words.map((word) => ({
        person: {
          OR: [
            { firstName: { contains: word, mode: "insensitive" as const } },
            { lastName: { contains: word, mode: "insensitive" as const } },
            { discordUsername: { contains: word, mode: "insensitive" as const } },
            { email: { contains: word, mode: "insensitive" as const } },
          ],
        },
      })),
    },
    orderBy: [{ person: { firstName: "asc" } }, { person: { lastName: "asc" } }],
    take: 8,
    select: {
      id: true,
      school: true,
      checkedInAt: true,
      person: { select: { firstName: true, lastName: true, discordUsername: true } },
    },
  });
  return rows.map((r) => ({
    applicationId: r.id,
    name: `${r.person.firstName} ${r.person.lastName}`.trim(),
    discordUsername: r.person.discordUsername,
    school: r.school,
    checkedIn: r.checkedInAt !== null,
  }));
}

export type CheckpointSummary = { id: string; name: string; kind: "MEAL" | "WORKSHOP"; count: number };

/** The scanner's modes and live counts for the current event. */
export async function scannerOverview() {
  const event = await currentEvent();
  if (!event) return null;
  const [checkpoints, checkedIn, admitted] = await Promise.all([
    prisma.checkpoint.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, kind: true, _count: { select: { scans: true } } },
    }),
    prisma.application.count({ where: { eventId: event.id, checkedInAt: { not: null } } }),
    prisma.application.count({ where: { eventId: event.id, status: "ACCEPTED", rsvpStatus: { not: "DECLINED" } } }),
  ]);
  return {
    eventName: event.name,
    checkedIn,
    admitted,
    checkpoints: checkpoints.map((c) => ({ id: c.id, name: c.name, kind: c.kind, count: c._count.scans })) as CheckpointSummary[],
  };
}

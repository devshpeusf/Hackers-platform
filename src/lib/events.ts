import { prisma } from "@/lib/prisma";

/**
 * Resolves the event an application belongs to.
 *
 * Deliberately a lookup rather than a hardcoded id: CLAUDE.md is explicit that
 * each hackathon is a row, not a fork of this repo. When there's a second
 * event, this is the one place that decides which one is taking applications.
 *
 * "Open" is currently "started most recently and hasn't ended". That's crude —
 * a real application window (applicationOpen / applicationDeadline, the way
 * Knight Hacks model it) belongs on the Event table, and is the natural home
 * for the applications-closed screen the design already has.
 */
export async function getOpenEvent() {
  return prisma.event.findFirst({
    where: { endDate: { gte: new Date() } },
    orderBy: { startDate: "desc" },
  });
}

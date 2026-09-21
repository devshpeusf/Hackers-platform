import { prisma } from "@/lib/prisma";

/**
 * Application lookups, keyed on the Discord account.
 *
 * Shared so `/apply/form` and `/apply/applied` can't drift apart on what
 * counts as "this person has already applied" — they ask the same question
 * for different reasons (one to redirect away from the form, one to redirect
 * into it).
 */

/**
 * Cheap existence check — for deciding whether to show the form at all.
 *
 * Scoped to a specific event, not just the Discord account: CLAUDE.md is
 * explicit that each hackathon is its own Event row, and an application to
 * a past event must never block someone from applying to a new one. Both
 * call sites pass the currently open event's id (see src/lib/events.ts) —
 * there's deliberately no "any event, ever" fallback here, so this can't
 * silently regress back to the bug this was scoped to fix.
 */
export async function hasApplied(discordId: string, eventId: string): Promise<boolean> {
  const found = await prisma.application.findFirst({
    where: { eventId, person: { discordId } },
    select: { id: true },
  });
  return found !== null;
}

/**
 * The full application, for rendering the status page.
 *
 * Deliberately NOT scoped to one event, unlike hasApplied above — this
 * answers "what did this person submit", and once there's a second event a
 * returning applicant should still be able to see last year's application
 * (most recent one wins) rather than have it disappear the moment a new
 * event opens.
 */
export async function getApplication(discordId: string) {
  return prisma.application.findFirst({
    where: { person: { discordId } },
    include: { person: true, event: true },
    orderBy: { createdAt: "desc" },
  });
}

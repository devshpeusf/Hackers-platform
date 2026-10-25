import { prisma } from "@/lib/prisma";

/**
 * Application lookups, keyed on the Discord account.
 *
 * Shared so `/apply/form` and `/apply/status` can't drift apart on what counts
 * as "this person has already applied" — they ask the same question for
 * different reasons (one to redirect, one to render).
 */

/**
 * The latest application, with person and event. Used both to render the
 * status page and to decide where someone lands after signing in (see
 * landingFor in src/lib/portal-access.ts) — so the two can't disagree.
 */
export async function getApplication(discordId: string) {
  return prisma.application.findFirst({
    where: { person: { discordId } },
    include: { person: true, event: true },
    orderBy: { createdAt: "desc" },
  });
}

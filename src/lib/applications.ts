import { prisma } from "@/lib/prisma";

/**
 * Application lookups, keyed on the Discord account.
 *
 * Shared so `/apply/form` and `/apply/status` can't drift apart on what counts
 * as "this person has already applied" — they ask the same question for
 * different reasons (one to redirect, one to render).
 */

/** Cheap existence check — for deciding whether to show the form at all. */
export async function hasApplied(discordId: string): Promise<boolean> {
  const found = await prisma.application.findFirst({
    where: { person: { discordId } },
    select: { id: true },
  });
  return found !== null;
}

/** The full application, for rendering the status page. */
export async function getApplication(discordId: string) {
  return prisma.application.findFirst({
    where: { person: { discordId } },
    include: { person: true, event: true },
    orderBy: { createdAt: "desc" },
  });
}

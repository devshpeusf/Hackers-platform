import { prisma } from "@/lib/prisma";

/**
 * Whether a signed-in Discord account belongs to an organizer.
 *
 * Person.role has no self-serve promotion path — it's set by hand in the DB
 * for the people running the event (see prisma/schema.prisma). This is the
 * one place that question gets asked, so every organizer-only page/action
 * checks it the same way rather than each reimplementing the lookup.
 */
export async function isOrganizer(discordId: string): Promise<boolean> {
  const person = await prisma.person.findUnique({
    where: { discordId },
    select: { role: true },
  });
  return person?.role === "ORGANIZER";
}

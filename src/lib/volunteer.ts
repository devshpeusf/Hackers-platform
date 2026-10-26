import { prisma } from "@/lib/prisma";

/**
 * Whether a verified Discord account belongs to a volunteer or organizer.
 * Pass the server-verified id from toApplicantIdentity, as with isOrganizer.
 * Missing identities and Person rows have no staff access.
 *
 * Roles are assigned manually in the DB. This helper is separate from
 * isOrganizer: existing organizer-only pages/actions keep their stricter gate.
 */
export async function isVolunteerOrAbove(discordId: string | null): Promise<boolean> {
  if (!discordId) return false;
  const person = await prisma.person.findUnique({
    where: { discordId },
    select: { role: true },
  });
  return person?.role === "VOLUNTEER" || person?.role === "ORGANIZER";
}

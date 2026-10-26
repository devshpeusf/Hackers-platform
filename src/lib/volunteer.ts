import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";

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

/**
 * The gate for staff-only pages that volunteers run — the door, not the review
 * queue. Mirrors requireOrganizer: not signed in -> sign-in; signed in without
 * staff access -> a plain 404, so the page doesn't confirm it exists to someone
 * trying URLs.
 *
 * Pages only. A Server Action can't usefully redirect anyone to a 404, so
 * actions call isVolunteerOrAbove themselves and bail.
 */
export async function requireVolunteerOrAbove() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const identity = toApplicantIdentity(user);
  if (!(await isVolunteerOrAbove(identity.discordId))) notFound();

  return identity;
}

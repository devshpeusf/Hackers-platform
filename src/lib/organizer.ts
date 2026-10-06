import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";

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

/**
 * The gate for organizer-only pages. Not signed in -> sign-in; signed in but
 * not an organizer -> a plain 404, so the page doesn't confirm it exists (or
 * that applicant data lives behind it) to someone poking at the URL.
 *
 * Pages only — a Server Action can't redirect someone to a 404 page in any
 * useful way, so actions call isOrganizer() themselves and bail.
 */
export async function requireOrganizer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const identity = toApplicantIdentity(user);
  if (!(await isOrganizer(identity.discordId))) notFound();

  return identity;
}

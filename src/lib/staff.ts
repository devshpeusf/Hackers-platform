import "server-only";

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import type { StaffRole } from "@/lib/admin-tools";

/**
 * The signed-in person's staff role, or null for everyone else. Uses the
 * verified Discord id (never user_metadata), like isOrganizer.
 */
export async function getStaffRole(): Promise<StaffRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { discordId } = toApplicantIdentity(user);
  if (!discordId) return null;

  const person = await prisma.person.findUnique({ where: { discordId }, select: { role: true } });
  return person?.role === "ORGANIZER" || person?.role === "VOLUNTEER" ? person.role : null;
}

/**
 * The gate for the /admin hub: volunteers and organizers, with the role so
 * the page can show the right tools. Same responses as the other gates — not
 * signed in -> sign-in, not staff -> a plain 404.
 */
export async function requireStaffRole(): Promise<StaffRole> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const role = await getStaffRole();
  if (!role) notFound();
  return role;
}

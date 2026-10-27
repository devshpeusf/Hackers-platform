"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { createTeam, joinTeam, leaveTeam, renameTeam, type TeamResult } from "@/lib/teams";

/**
 * Team actions (/team). A Server Action is a public endpoint, so whose team
 * this touches comes only from the session's verified Discord identity —
 * forms carry nothing but a team name or an invite code. Same
 * latest-application convention as getCurrentHacker.
 */

export type TeamActionState = { status: "idle" } | { status: "ok" } | { status: "error"; message: string };

async function sessionApplication(): Promise<{ applicationId: string; discordUsername: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const identity = toApplicantIdentity(user);
  if (!identity.discordId) return null;

  const application = await prisma.application.findFirst({
    where: { person: { discordId: identity.discordId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (!application) return null;
  // The handle is display-only, so the editable metadata it comes from is fine.
  return { applicationId: application.id, discordUsername: identity.username === "unknown" ? null : identity.username };
}

async function run(action: (s: { applicationId: string; discordUsername: string | null }) => Promise<TeamResult>): Promise<TeamActionState> {
  try {
    const session = await sessionApplication();
    if (!session) return { status: "error", message: "Sign in again to manage your team." };
    const result = await action(session);
    if (!result.ok) return { status: "error", message: result.message };
    revalidatePath("/team");
    revalidatePath("/dashboard");
    return { status: "ok" };
  } catch {
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}

export async function createTeamAction(_: TeamActionState, formData: FormData) {
  return run((s) => createTeam(s.applicationId, formData.get("name"), s.discordUsername));
}

export async function joinTeamAction(_: TeamActionState, formData: FormData) {
  return run((s) => joinTeam(s.applicationId, formData.get("code"), s.discordUsername));
}

export async function renameTeamAction(_: TeamActionState, formData: FormData) {
  return run((s) => renameTeam(s.applicationId, formData.get("name")));
}

export async function leaveTeamAction(_: TeamActionState) {
  return run((s) => leaveTeam(s.applicationId));
}

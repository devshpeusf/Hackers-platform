"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { setPersonRole } from "@/lib/roles";

export type RoleActionState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

/**
 * Changes one person's role (/admin/roles). A Server Action is a public
 * endpoint, so the organizer check happens here, from the verified Discord
 * id — the page in front of it proves nothing. The target person comes from
 * the form (choosing who to change is the point); setPersonRole validates
 * the role, refuses self-changes, and records who made the change.
 */
export async function changeRoleAction(_: RoleActionState, formData: FormData): Promise<RoleActionState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const discordId = user ? toApplicantIdentity(user).discordId : null;
    const actor = discordId
      ? await prisma.person.findUnique({ where: { discordId }, select: { id: true, role: true } })
      : null;
    if (actor?.role !== "ORGANIZER") return { status: "error", message: "Only organizers can change roles." };

    const personId = formData.get("personId");
    if (typeof personId !== "string" || !personId) return { status: "error", message: "No person selected." };

    const result = await setPersonRole(actor.id, personId, formData.get("role"));
    if (!result.ok) return { status: "error", message: result.message };

    revalidatePath("/admin/roles");
    return { status: "ok", message: result.changed ? "Role updated." : "No change." };
  } catch {
    return { status: "error", message: "Couldn't save. Please try again." };
  }
}

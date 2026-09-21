"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { isOrganizer } from "@/lib/organizer";

/**
 * Resets one FAILED row back to PENDING for a manual retry from the admin
 * page. A Server Action is a public endpoint on its own — reachable by
 * anyone who can craft the POST, not just someone who clicked the button on
 * a gated page — so this re-checks organizer status itself rather than
 * trusting that only the admin page can reach it.
 */
export async function resetEmailQueueRow(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const identity = toApplicantIdentity(user);
  if (!(await isOrganizer(identity.discordId))) return;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  // Only ever moves a FAILED row to PENDING — scoping the update in the
  // WHERE clause means a stale form (someone left the page open while
  // another organizer already retried the same row) is a no-op, not a
  // reset of whatever state it's since moved to.
  await prisma.emailQueue.updateMany({
    where: { id, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, lastError: null },
  });

  revalidatePath("/admin/email-queue");
}

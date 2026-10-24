"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { verifiedDiscordId } from "@/lib/supabase/user";
import { recordSignedInRsvpResponse } from "@/lib/rsvp";
import type { RsvpActionState } from "./[token]/actions";

/**
 * RSVP from the status card (PLAT-45), for a hacker who's signed in rather
 * than holding the emailed link.
 *
 * A Server Action is a public endpoint, so whose RSVP this is comes only from
 * the session's verified Discord identity — the form carries nothing but the
 * choice. Same latest-application convention as getCurrentHacker and the
 * status page, so the button answers for the application the card shows.
 */
export async function respondToRsvpSignedIn(
  _previousState: RsvpActionState,
  formData: FormData,
): Promise<RsvpActionState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const discordId = user ? verifiedDiscordId(user) : null;
    if (!discordId) return { status: "UNAVAILABLE" };

    const application = await prisma.application.findFirst({
      where: { person: { discordId } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (!application) return { status: "UNAVAILABLE" };

    const result = await recordSignedInRsvpResponse(application.id, formData.get("choice"));

    // Both places the card lives. A decline also takes them out of the
    // portal: the dashboard's own access check redirects on the next render.
    revalidatePath("/dashboard");
    revalidatePath("/apply/status");
    return result;
  } catch {
    // Same as the link flow: no database errors in the browser.
    return { status: "ERROR" };
  }
}

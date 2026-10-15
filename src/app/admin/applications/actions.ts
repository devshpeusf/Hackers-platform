"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { decisionLocked, parseDecision } from "@/lib/decisions";

/**
 * Marks one applicant accepted, waitlisted or rejected (PLAT-39).
 *
 * A Server Action is a public endpoint reachable by anyone who can craft the
 * POST — the organizer gate on the page in front of it proves nothing here —
 * so this re-checks the role itself, the same as resetEmailQueueRow.
 *
 * Outcomes come back as a `?decision=` query param rather than a return value:
 * the review page is a Server Component with plain forms, so there's nothing
 * client-side to receive a returned result.
 */
/**
 * Keeps `returnTo` an internal admin path.
 *
 * It arrives in a form POST, so it's attacker-controllable: without this, the
 * redirect is an open redirect that would bounce an organizer to any site
 * someone could get them to submit.
 */
function safeReturnTo(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  // Must be a path on this site, not "//evil.com" or "https://evil.com", and
  // with no ".." for the browser to normalise back out of /admin.
  if (!raw.startsWith("/admin/applications")) return null;
  if (raw.startsWith("//") || raw.includes("..")) return null;
  return raw;
}

export async function decideApplication(formData: FormData) {
  const id = formData.get("id");
  const decision = parseDecision(formData.get("decision"));
  const override = formData.get("override") === "true";
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (typeof id !== "string" || !id || !decision) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const identity = toApplicantIdentity(user);
  // One lookup for both questions: is this an organizer, and which Person row
  // do we credit the decision to.
  const organizer = await prisma.person.findUnique({
    where: { discordId: identity.discordId },
    select: { id: true, role: true },
  });
  if (organizer?.role !== "ORGANIZER") return;

  // Decisions are made from two places — the list and the detail page — and
  // each should stay where it was. Defaults to the detail page.
  const back = returnTo ?? `/admin/applications/${id}`;

  // Read, check and write in one transaction. Sends are a deliberate batch
  // action so losing this race is unlikely, but the failure it prevents —
  // flipping a decision while its email is already going out — is the worst
  // thing this feature can do, and the guard is nearly free.
  const result = await prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({
      where: { id },
      select: {
        status: true,
        emailQueue: { select: { emailType: true, status: true, sentAt: true } },
      },
    });
    if (!application) return "missing" as const;

    if (application.status === decision) return "unchanged" as const;

    if (decisionLocked(application.status, application.emailQueue) && !override) {
      return "locked" as const;
    }

    await tx.application.update({
      where: { id },
      data: { status: decision, decidedById: organizer.id, decidedAt: new Date() },
    });
    return "ok" as const;
  });

  if (result === "missing") return;

  // The list's status column is the other thing that has to be right
  // immediately, which is why both paths are revalidated.
  revalidatePath("/admin/applications");
  revalidatePath(back);

  redirect(`${back}${back.includes("?") ? "&" : "?"}decision=${result}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import {
  announcementBlockedReason,
  decisionLocked,
  emailTypeFor,
  needsAnnouncement,
  parseDecision,
} from "@/lib/decisions";
import type { EmailType } from "@/generated/prisma/client";

/**
 * Organizer actions on applications: marking a decision (PLAT-39), and
 * queueing the email that announces it (PLAT-42).
 *
 * A Server Action is a public endpoint reachable by anyone who can craft the
 * POST — the organizer gate on the page in front of it proves nothing here —
 * so every action re-checks the role itself, the same as resetEmailQueueRow.
 *
 * Outcomes come back as a query param rather than a return value: these pages
 * are Server Components with plain forms, so there's nothing client-side to
 * receive a returned result.
 */

/**
 * The signed-in organizer's Person row, or null for everyone else.
 *
 * One lookup answers both questions every action here needs: is this an
 * organizer, and which Person do we credit the write to.
 */
async function currentOrganizer(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Verified Discord id only — see verifiedDiscordId for why not metadata.
  const { discordId } = toApplicantIdentity(user);
  if (!discordId) return null;

  const person = await prisma.person.findUnique({
    where: { discordId },
    select: { id: true, role: true },
  });
  return person?.role === "ORGANIZER" ? { id: person.id } : null;
}

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

/** Marks one applicant accepted, waitlisted or rejected (PLAT-39). */
export async function decideApplication(formData: FormData) {
  const id = formData.get("id");
  const decision = parseDecision(formData.get("decision"));
  const override = formData.get("override") === "true";
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (typeof id !== "string" || !id || !decision) return;

  const organizer = await currentOrganizer();
  if (!organizer) return;

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

/**
 * Queues the decision emails (PLAT-42).
 *
 * Nothing is sent here. This inserts PENDING EmailQueue rows; the external
 * scheduler's call to /api/jobs/send-queued does the sending, with the retry,
 * rate-limit and quota handling that already lives there. So this action is
 * cheap and fast however many applicants it covers, and a Resend outage at
 * this moment costs nothing.
 *
 * With an `id` it queues that one applicant; without, every decided applicant
 * on the current event who hasn't been emailed yet.
 *
 * Safe to submit twice. Rows are skipped if they already exist, and
 * @@unique([applicationId, emailType]) is the real guarantee underneath —
 * nobody gets told twice because someone double-clicked.
 */
export async function queueDecisionEmails(formData: FormData) {
  const singleId = formData.get("id");
  const one = typeof singleId === "string" && singleId ? singleId : null;
  const returnTo = safeReturnTo(formData.get("returnTo"));

  const organizer = await currentOrganizer();
  if (!organizer) return;

  // Read once, here, rather than inside the loop: a config value that changed
  // mid-batch would queue some acceptances and block others.
  const rsvpUrl = process.env.RSVP_URL;

  let scope;
  if (one) {
    scope = { id: one };
  } else {
    // Same event as the list page: most recent, not getOpenEvent(), since
    // decisions go out after applications have closed.
    const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" } });
    if (!event) return;
    scope = { eventId: event.id };
  }

  const candidates = await prisma.application.findMany({
    where: { ...scope, status: { not: "SUBMITTED" } },
    select: {
      id: true,
      status: true,
      emailQueue: { select: { emailType: true } },
    },
  });

  const rows: { applicationId: string; emailType: EmailType }[] = [];
  let blocked = 0;

  for (const application of candidates) {
    // Narrows status to a Decision — the query already excluded SUBMITTED, but
    // the type doesn't know that.
    if (application.status === "SUBMITTED") continue;
    if (!needsAnnouncement(application.status, application.emailQueue)) continue;
    if (announcementBlockedReason(application.status, rsvpUrl)) {
      blocked++;
      continue;
    }
    rows.push({ applicationId: application.id, emailType: emailTypeFor(application.status) });
  }

  const queued = rows.length
    ? await prisma.emailQueue.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };

  const back = returnTo ?? (one ? `/admin/applications/${one}` : "/admin/applications/send");

  revalidatePath("/admin/applications");
  revalidatePath("/admin/applications/send");
  revalidatePath("/admin/email-queue");
  revalidatePath(back);

  const params = new URLSearchParams({ queued: String(queued.count) });
  if (blocked) params.set("blocked", String(blocked));
  redirect(`${back}${back.includes("?") ? "&" : "?"}${params}`);
}

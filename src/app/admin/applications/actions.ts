"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { revokeRsvpTokens } from "@/lib/rsvp";
import { ensureBadgeToken } from "@/lib/badge";
import { getRsvpBaseUrl } from "@/lib/site-url";
import {
  BULK_LIMIT,
  DECISIONS,
  announcementBlockedReason,
  decisionLocked,
  emailTypeFor,
  needsAnnouncement,
  parseDecision,
  planBulkDecision,
  canQueueRsvpInvitation,
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
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

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
    // Same row lock as RSVP issuance, revocation and public responses. Read
    // the decision only after waiting so a concurrent change cannot be missed.
    await tx.$queryRaw`SELECT "id" FROM "Application" WHERE "id" = ${id} FOR UPDATE`;
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

    const updated = await tx.application.updateMany({
      where: {
        id, status: application.status,
        ...(!override && {
          NOT: { OR: DECISIONS.map((d) => ({
            status: d,
            emailQueue: { some: { emailType: emailTypeFor(d), status: { in: ["SENT", "SENDING"] } } },
          })) },
        }),
      },
      data: {
        status: decision, decidedById: organizer.id, decidedAt: new Date(),
        ...(decision === "ACCEPTED" && { rsvpStatus: "PENDING", rsvpRespondedAt: null }),
      },
    });
    if (updated.count !== 1) return "locked" as const;
    if (decision === "ACCEPTED") await ensureBadgeToken(id, tx);
    if (application.status === "ACCEPTED") {
      await revokeRsvpTokens(id, tx);
      // Don't let an old pending email automatically invite them again after
      // re-acceptance. SENDING is left to the already-running worker.
      await tx.emailQueue.updateMany({
        where: { applicationId: id, emailType: "ACCEPTED", status: "PENDING" },
        data: { status: "FAILED", lastError: "Acceptance withdrawn. Review the decision before queueing another invitation." },
      });
    }
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
 * Marks many applicants with one decision at once, from the list's checkboxes.
 *
 * Only decides — nothing is emailed. Those applicants then show up in the
 * "decisions haven't been emailed yet" banner like any other decision.
 *
 * The browser only sends a list of ids, so none of it is trusted: the
 * organizer is re-checked, ids are de-duplicated and capped, and only
 * applications on the current event are touched — an id from anywhere else
 * is ignored rather than decided.
 *
 * Applicants whose outcome has already been emailed are always skipped (see
 * planBulkDecision); there's deliberately no bulk override.
 */
export async function decideApplications(formData: FormData) {
  const decision = parseDecision(formData.get("decision"));
  const returnTo = safeReturnTo(formData.get("returnTo")) ?? "/admin/applications";
  const ids = [
    ...new Set(formData.getAll("ids").filter((v): v is string => typeof v === "string" && v.length > 0)),
  ];

  if (!decision || ids.length === 0 || ids.length > BULK_LIMIT) return;

  const organizer = await currentOrganizer();
  if (!organizer) return;

  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" } });
  if (!event) return;

  const result = await prisma.$transaction(async (tx) => {
    // Consistent lock order avoids deadlocks between overlapping bulk actions.
    await tx.$queryRaw`
      SELECT "id" FROM "Application"
      WHERE "id" = ANY(${ids}::text[]) AND "eventId" = ${event.id}
      ORDER BY "id" FOR UPDATE
    `;
    const applications = await tx.application.findMany({
      where: { id: { in: ids }, eventId: event.id },
      select: {
        id: true,
        status: true,
        emailQueue: { select: { emailType: true, status: true, sentAt: true } },
      },
    });

    const plan = planBulkDecision(applications, decision);

    // The write repeats the plan's conditions instead of trusting the read:
    // if a decision email goes out, or someone else decides one of these,
    // between the read and here, that row is left alone rather than flipped.
    const updated = plan.toChange.length
      ? await tx.application.updateManyAndReturn({
          where: {
            id: { in: plan.toChange.map((a) => a.id) },
            eventId: event.id,
            status: { not: decision },
            NOT: {
              OR: DECISIONS.map((d) => ({
                status: d,
                emailQueue: { some: { emailType: emailTypeFor(d), status: { in: ["SENT", "SENDING"] } } },
              })),
            },
          },
          data: {
            status: decision, decidedById: organizer.id, decidedAt: new Date(),
            ...(decision === "ACCEPTED" && { rsvpStatus: "PENDING", rsvpRespondedAt: null }),
          },
          select: { id: true },
        })
      : [];

    if (decision === "ACCEPTED") {
      // A separate issuance per changed row gives each attendee a distinct
      // credential. All locks are held, and any failure rolls back the batch.
      for (const application of updated) await ensureBadgeToken(application.id, tx);
    }

    const changedIds = new Set(updated.map((a) => a.id));
    const withdrawn = applications
      .filter((a) => a.status === "ACCEPTED" && changedIds.has(a.id))
      .map((a) => a.id);
    if (withdrawn.length) {
      const now = new Date();
      // All application locks are already held. Revoke in one write, and
      // only for the ACCEPTED rows returned by the guarded decision update.
      await tx.rsvpToken.updateMany({
        where: { applicationId: { in: withdrawn }, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      await tx.emailQueue.updateMany({
        where: { applicationId: { in: withdrawn }, emailType: "ACCEPTED", status: "PENDING" },
        data: { status: "FAILED", lastError: "Acceptance withdrawn. Review the decision before queueing another invitation." },
      });
    }

    return {
      changed: updated.length,
      unchanged: plan.unchanged.length,
      skipped: plan.locked.length + (plan.toChange.length - updated.length),
      ignored: ids.length - applications.length,
    };
  }, {
    // Allow the per-attendee badge writes up to BULK_LIMIT to finish over the
    // shared DB connection, with a bounded transaction timeout.
    timeout: 60_000,
  });

  revalidatePath("/admin/applications");

  const params = new URLSearchParams({ bulk: decision.toLowerCase(), changed: String(result.changed) });
  if (result.unchanged) params.set("unchanged", String(result.unchanged));
  if (result.skipped) params.set("skipped", String(result.skipped));
  if (result.ignored) params.set("ignored", String(result.ignored));
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${params}`);
}

/** Explicit organizer send for a new acceptance cycle; never called by deciding. */
export async function queueRsvpInvitation(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  if (!(await currentOrganizer())) return;
  const back = `/admin/applications/${encodeURIComponent(id)}`;
  try {
    getRsvpBaseUrl(process.env.RSVP_URL);
  } catch {
    redirect(`${back}?invitation=blocked`);
  }

  const queued = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Application" WHERE "id" = ${id} FOR UPDATE`;
    const application = await tx.application.findUnique({
      where: { id },
      select: {
        status: true, rsvpStatus: true, decidedAt: true,
        emailQueue: { select: { emailType: true, status: true, sentAt: true } },
        rsvpTokens: { select: { revokedAt: true, expiresAt: true } },
      },
    });
    const now = new Date();
    if (!application || !canQueueRsvpInvitation(application, now)) return false;
    const updated = await tx.emailQueue.updateMany({
      where: { applicationId: id, emailType: "ACCEPTED", status: { in: ["SENT", "FAILED"] } },
      data: { status: "PENDING", attempts: 0, sentAt: null, lastError: null, createdAt: now },
    });
    return updated.count === 1;
  });
  revalidatePath("/admin/applications");
  revalidatePath("/admin/email-queue");
  revalidatePath(back);
  redirect(`${back}?invitation=${queued ? "queued" : "unchanged"}`);
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

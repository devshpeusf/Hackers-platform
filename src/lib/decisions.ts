import type { ApplicationStatus, EmailType, EmailStatus } from "@/generated/prisma/client";

/**
 * The rules behind marking a decision (PLAT-39).
 *
 * Pure functions, no database: the one rule here that actually matters —
 * whether a decision is still safe to change — is worth being able to reason
 * about and test on its own, and the review page needs to ask the same
 * question the server action does when deciding what to render.
 */

/** A decision, as opposed to the SUBMITTED starting state. */
export type Decision = Exclude<ApplicationStatus, "SUBMITTED">;

export const DECISIONS = ["ACCEPTED", "WAITLISTED", "REJECTED"] as const satisfies readonly Decision[];

/** `?status=accepted` style input -> a Decision, or null if it isn't one. */
export function parseDecision(raw: unknown): Decision | null {
  const upper = typeof raw === "string" ? raw.toUpperCase() : "";
  return (DECISIONS as readonly string[]).includes(upper) ? (upper as Decision) : null;
}

/**
 * The email that announces a given outcome.
 *
 * The three decision EmailType values are named identically to the
 * ApplicationStatus values on purpose, so this is a cast rather than a lookup
 * table that could fall out of step with the enum.
 */
export function emailTypeFor(status: Decision): EmailType;
export function emailTypeFor(status: ApplicationStatus): EmailType | null;
export function emailTypeFor(status: ApplicationStatus): EmailType | null {
  return status === "SUBMITTED" ? null : (status satisfies Decision as EmailType);
}

/** The subset of an EmailQueue row this module needs. */
type QueuedEmail = { emailType: EmailType; status: EmailStatus; sentAt: Date | null };

/**
 * Whether the applicant has already been told their current outcome — in which
 * case changing it needs a deliberate override, not a stray click.
 *
 * SENDING counts as told, not just SENT. That status means a send is in flight
 * (see the note on EmailStatus in schema.prisma); by the time anyone could act
 * on this answer the message has left. Treating it as "not yet sent" would
 * leave a window where an acceptance could be flipped to a rejection while the
 * acceptance email was mid-delivery — the single worst outcome this feature
 * can produce.
 *
 * FAILED and PENDING are not locked: nothing reached the applicant, so the
 * decision is still ours to change.
 */
export function announcedEmail(
  status: ApplicationStatus,
  emails: readonly QueuedEmail[],
): QueuedEmail | null {
  const expected = emailTypeFor(status);
  if (!expected) return null;
  return (
    emails.find(
      (e) => e.emailType === expected && (e.status === "SENT" || e.status === "SENDING"),
    ) ?? null
  );
}

/** Convenience wrapper: has this outcome already gone out? */
export function decisionLocked(
  status: ApplicationStatus,
  emails: readonly QueuedEmail[],
): boolean {
  return announcedEmail(status, emails) !== null;
}

/** Most applicants one bulk decision may touch. Above the current event's size, below anything abusive. */
export const BULK_LIMIT = 500;

/**
 * Splits a bulk selection into what a decision would actually change.
 *
 * - unchanged: already at this decision — left alone, so who decided them and
 *   when isn't overwritten.
 * - locked: their current outcome has already been emailed. Changing those
 *   stays a one-at-a-time action on the detail page, behind its warning; bulk
 *   never overrides, the same rule as the row buttons.
 * - toChange: everything else.
 */
export function planBulkDecision<T extends { id: string; status: ApplicationStatus; emailQueue: readonly QueuedEmail[] }>(
  applications: readonly T[],
  decision: Decision,
): { toChange: T[]; unchanged: T[]; locked: T[] } {
  const toChange: T[] = [];
  const unchanged: T[] = [];
  const locked: T[] = [];
  for (const application of applications) {
    if (application.status === decision) unchanged.push(application);
    else if (decisionLocked(application.status, application.emailQueue)) locked.push(application);
    else toChange.push(application);
  }
  return { toChange, unchanged, locked };
}

/**
 * Whether this outcome still needs its email queued (PLAT-42).
 *
 * "No row of that type exists" rather than "no SENT row": a FAILED row has
 * already been queued and its retry path is the RETRY button on
 * /admin/email-queue, not a second insert. The @@unique([applicationId,
 * emailType]) constraint would reject one anyway — this just means the UI
 * doesn't offer to do something the database will refuse.
 */
export function needsAnnouncement(
  status: ApplicationStatus,
  emails: readonly { emailType: EmailType }[],
): boolean {
  const expected = emailTypeFor(status);
  if (!expected) return false;
  return !emails.some((e) => e.emailType === expected);
}

/**
 * Why this decision can't be emailed yet, or null if it can.
 *
 * Only ACCEPTED is ever blocked, and only until RSVP exists (PLAT-43): the
 * acceptance template's "confirm I'm coming" button points at RSVP_URL, and
 * the send route already throws rather than mail a dead link. Checking it
 * here too means those rows are never queued in the first place — queueing
 * them would burn all three attempts and park them in FAILED, which reads
 * like a broken send rather than a feature that isn't built.
 *
 * Takes the URL as an argument instead of reading process.env so this module
 * stays pure and the rule is testable both ways.
 */
export function announcementBlockedReason(
  decision: Decision,
  rsvpUrl: string | undefined,
): string | null {
  if (decision !== "ACCEPTED") return null;
  if (rsvpUrl) return null;
  return "RSVP_URL isn't set, so the acceptance email's confirm button would be dead (PLAT-43)";
}

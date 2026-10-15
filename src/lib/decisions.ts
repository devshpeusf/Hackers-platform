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

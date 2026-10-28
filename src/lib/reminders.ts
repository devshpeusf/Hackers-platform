import type {
  ApplicationSource,
  ApplicationStatus,
  EmailType,
  RsvpStatus,
} from "@/generated/prisma/client";

/**
 * Who still needs the MLH registration reminder (PLAT-26).
 *
 * Pure, no I/O, same as src/lib/decisions.ts — the whole ticket is one
 * eligibility rule, and a rule that decides who gets emailed is worth being
 * able to test exhaustively without a database.
 */

/** Just the fields the rule reads, so a page can pass its row straight in. */
export type ReminderCandidate = {
  status: ApplicationStatus;
  source: ApplicationSource;
  rsvpStatus: RsvpStatus;
  emailQueue: readonly { emailType: EmailType }[];
};

/**
 * Whether this applicant should get the reminder.
 *
 * - ACCEPTED only. Waitlisted and rejected applicants aren't coming, and
 *   telling them to register for an event they're not attending is worse than
 *   silence.
 * - Not a WALK_IN. A walk-in is created at the door, on the day, already
 *   admitted — so a "register before the event" nudge is either too late to
 *   act on or, worse, sent days after the event ended. Without this the
 *   reminder banner reappears the moment the first walk-in is registered and
 *   never clears, because nothing else here is time-gated. Same guard, and the
 *   same reason, as needsAnnouncement in decisions.ts.
 * - Not DECLINED. Someone who answered their RSVP with "no" has withdrawn;
 *   chasing them for paperwork reads as not having listened. PENDING *is*
 *   included — they haven't said no, they still need to register, and the
 *   nudge may prompt both.
 * - Not already reminded. One reminder per application, which the existing
 *   @@unique([applicationId, emailType]) enforces underneath. We can't tell
 *   who completed MLH registration — that lives in OrganizerHQ and nothing
 *   reports back — so a second reminder couldn't be aimed at the people who
 *   need it, only resent to everyone.
 *
 * This is checked twice: when queueing, and again in the send route just
 * before the message goes out. Queueing a batch and draining it are minutes to
 * days apart, and an applicant can decline their RSVP in between.
 */
export function needsMlhReminder(application: ReminderCandidate): boolean {
  if (application.status !== "ACCEPTED") return false;
  if (application.source === "WALK_IN") return false;
  if (application.rsvpStatus === "DECLINED") return false;
  return !alreadyReminded(application.emailQueue);
}

/** Already has a reminder row of any status — queued, sent or failed. */
export function alreadyReminded(emails: readonly { emailType: EmailType }[]): boolean {
  return emails.some((e) => e.emailType === "MLH_REMINDER");
}

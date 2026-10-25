import type { ApplicationStatus, RsvpStatus } from "@/generated/prisma/client";

/**
 * Who gets the hacker portal, and where everyone else lands after signing in.
 *
 * One rule, used by both the portal's own gate (getCurrentHacker) and the
 * sign-in landing pages, so "sent to the dashboard" and "allowed in the
 * dashboard" can never disagree — otherwise someone could be bounced back and
 * forth between the two.
 *
 * Plain functions, no database, so they're testable on their own.
 */

/** Accepted, and hasn't declined. Pending RSVPs get in so they can confirm from the dashboard. */
export function canEnterPortal(application: { status: ApplicationStatus; rsvpStatus: RsvpStatus }): boolean {
  return application.status === "ACCEPTED" && (application.rsvpStatus === "PENDING" || application.rsvpStatus === "CONFIRMED");
}

/**
 * Where a signed-in person should land, given their latest application.
 *
 * - Portal access → the dashboard.
 * - No decision yet → the "submitted" screen.
 * - Any other decision (waitlisted, rejected, or accepted-but-declined) → the
 *   status page, whose card says what actually happened. The submitted screen
 *   would tell them they're still "in the pile".
 * - No application → the form.
 */
export function landingFor(
  application: { status: ApplicationStatus; rsvpStatus: RsvpStatus } | null,
): "/dashboard" | "/apply/applied" | "/apply/status" | "/apply/form" {
  if (!application) return "/apply/form";
  if (canEnterPortal(application)) return "/dashboard";
  if (application.status === "SUBMITTED") return "/apply/applied";
  return "/apply/status";
}

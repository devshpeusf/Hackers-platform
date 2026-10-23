import type { ApplicationStatus, RsvpStatus } from "@/generated/prisma/client";

/**
 * What the applicant's status card says in each state (PLAT-45) — shared by
 * the portal dashboard and /apply/status so the two can't drift apart.
 *
 * Plain data, no JSX, so it's easy to test and the one place to edit wording.
 * Tone matches the decision emails in emails/.
 *
 * RSVP remains separate from the admission decision. Callers that supply it
 * can show the recorded response without exposing an ID or a bearer link.
 */

export type StatusCardContent = {
  /** The big coloured word(s). */
  headline: string;
  /** A theme color token — the card's border and headline. */
  color: string;
  body: string;
  /** A link to act on, when there's something to do. */
  action?: { label: string; href: string };
};

const BY_STATUS: Record<ApplicationStatus, StatusCardContent> = {
  SUBMITTED: {
    headline: "APPLIED",
    color: "var(--color-accent-amber)",
    body: "We've got your application. Decisions go out before the event, and we'll email you either way.",
  },
  ACCEPTED: {
    headline: "ACCEPTED",
    color: "var(--color-accent-teal)",
    body: "You're in! Watch your email for the link to confirm your spot.",
  },
  WAITLISTED: {
    headline: "WAITLISTED",
    color: "var(--color-accent-purple-light)",
    body: "You're on the waitlist. It's a real one: if a spot opens up, we'll email you. There's nothing you need to do right now.",
  },
  REJECTED: {
    headline: "NOT THIS TIME",
    color: "var(--color-text-muted)",
    body: "We weren't able to offer you a spot this time. SHPE USF runs more events through the year, and you're welcome to apply to the next one.",
  },
};

const NO_APPLICATION: StatusCardContent = {
  headline: "NOT APPLIED YET",
  color: "var(--color-accent-pink)",
  body: "You haven't applied with this Discord account yet.",
  action: { label: "START YOUR APPLICATION", href: "/apply/form" },
};

/** `null` means signed in but no application on file. */
export function getStatusCardContent(status: ApplicationStatus | null, rsvpStatus?: RsvpStatus): StatusCardContent {
  if (status === "ACCEPTED" && rsvpStatus === "CONFIRMED") {
    return {
      headline: "ACCEPTED · CONFIRMED", color: "var(--color-accent-teal)",
      body: "Your attendance is confirmed. To request a change, contact the event organizers.",
    };
  }
  if (status === "ACCEPTED" && rsvpStatus === "DECLINED") {
    return {
      headline: "ACCEPTED · DECLINED", color: "var(--color-text-muted)",
      body: "You declined attendance. Portal access is unavailable. To request a change, contact the event organizers.",
    };
  }
  return status ? BY_STATUS[status] : NO_APPLICATION;
}

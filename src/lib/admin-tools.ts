/**
 * Every staff tool, in one list: the /admin hub's cards and the admin nav bar
 * both read it, so adding a tool here adds it everywhere — and the two can't
 * disagree about who sees what.
 *
 * Showing a link is not access control. Every page and action still checks
 * the role itself (requireOrganizer / requireVolunteerOrAbove); this only
 * decides what's worth linking to.
 */

export type StaffRole = "ORGANIZER" | "VOLUNTEER";

export type AdminTool = {
  href: string;
  /** Short, for the nav bar. */
  label: string;
  /** For the hub card. */
  title: string;
  description: string;
  /** "staff" = volunteers and organizers; "organizer" = organizers only. */
  access: "staff" | "organizer";
  /** Not built yet: shown on the hub as "coming soon", left out of the nav. */
  soon?: true;
  /** A theme color token for the card. */
  color: string;
};

export const ADMIN_TOOLS: readonly AdminTool[] = [
  {
    href: "/admin/applications",
    label: "Applications",
    title: "APPLICATIONS",
    description: "Review applicants and accept, waitlist or reject them.",
    access: "organizer",
    color: "var(--color-accent-teal)",
  },
  {
    href: "/admin/applications/send",
    label: "Send decisions",
    title: "SEND DECISIONS",
    description: "Email decided applicants their result and RSVP link.",
    access: "organizer",
    color: "var(--color-accent-pink)",
  },
  {
    href: "/admin/applications/remind",
    label: "MLH reminder",
    title: "MLH REMINDER",
    description: "Nudge accepted hackers to finish MLH registration before the event.",
    access: "organizer",
    color: "var(--color-accent-amber)",
  },
  {
    href: "/admin/email",
    label: "Email hackers",
    title: "EMAIL HACKERS",
    description: "Send an announcement to a group, like everyone accepted.",
    access: "organizer",
    color: "var(--color-accent-purple-light)",
  },
  {
    href: "/admin/email-queue",
    label: "Email queue",
    title: "EMAIL QUEUE",
    description: "See what's sent, pending or failed, and retry failures.",
    access: "organizer",
    color: "var(--color-accent-amber)",
  },
  {
    href: "/admin/event",
    label: "Event & guide",
    title: "EVENT & GUIDE",
    description: "Edit the hacker guide, locations, schedule and help contacts.",
    access: "organizer",
    color: "var(--color-accent-magenta)",
  },
  {
    href: "/admin/roles",
    label: "Roles",
    title: "ROLES",
    description: "Make people volunteers or organizers, or remove staff access.",
    access: "organizer",
    color: "var(--color-accent-purple-light)",
  },
  {
    href: "/admin/walk-in",
    label: "Walk-in",
    title: "WALK-IN REGISTRATION",
    description: "Register hackers who show up at the door.",
    access: "staff",
    color: "var(--color-accent-teal)",
  },
  {
    href: "/admin/check-in",
    label: "Check-in",
    title: "CHECK-IN SCANNER",
    description: "Scan hackers' QR badges at the door.",
    access: "staff",
    soon: true,
    color: "var(--color-accent-pink)",
  },
];

/** The tools this role can use. Organizers see everything; volunteers only staff tools. */
export function toolsFor(role: StaffRole): AdminTool[] {
  return ADMIN_TOOLS.filter((tool) => role === "ORGANIZER" || tool.access === "staff");
}

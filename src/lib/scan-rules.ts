/**
 * What a badge scan at /admin/check-in is allowed to do. Pure and
 * dependency-free, so it's tested on its own; src/lib/check-in.ts loads the
 * hacker, asks evaluateScan, and only writes when it says ok or warning.
 *
 * Everything is decided from the hacker's status at the moment of the scan,
 * not when the badge was issued: a screenshot of a QR can be forwarded, and
 * an acceptance can be withdrawn after the badge exists.
 */

/** What the volunteer is scanning for: arrival, or one meal/workshop. */
export type ScanTarget = "CHECK_IN" | "MEAL" | "WORKSHOP";

/** The hacker as the scanner sees them; null when the badge isn't ours. */
export type ScanSubject = {
  /** False when the badge belongs to a different event's application. */
  sameEvent: boolean;
  status: string;
  rsvpStatus: string;
  isMinor: boolean;
  checkedInAt: Date | null;
  /** When they were already scanned for this target, if they were. */
  alreadyAt: Date | null;
};

export type BlockReason = "unknown" | "other_event" | "not_accepted" | "declined" | "not_checked_in" | "already_scanned";
export type ScanWarning = "minor" | "no_rsvp";

export type ScanVerdict = { outcome: "blocked"; reason: BlockReason } | { outcome: "ok" | "warning"; warnings: ScanWarning[] };

export function evaluateScan(target: ScanTarget, subject: ScanSubject | null): ScanVerdict {
  if (!subject) return { outcome: "blocked", reason: "unknown" };
  if (!subject.sameEvent) return { outcome: "blocked", reason: "other_event" };
  if (subject.status !== "ACCEPTED") return { outcome: "blocked", reason: "not_accepted" };
  if (subject.rsvpStatus === "DECLINED") return { outcome: "blocked", reason: "declined" };
  if (target !== "CHECK_IN" && !subject.checkedInAt) return { outcome: "blocked", reason: "not_checked_in" };
  if (subject.alreadyAt) return { outcome: "blocked", reason: "already_scanned" };

  const warnings: ScanWarning[] = [];
  // Only worth raising at the door: by lunch they've already been seen.
  if (target === "CHECK_IN" && subject.isMinor) warnings.push("minor");
  if (target === "CHECK_IN" && subject.rsvpStatus !== "CONFIRMED") warnings.push("no_rsvp");
  return { outcome: warnings.length ? "warning" : "ok", warnings };
}

/** What the volunteer reads, big, on the result card. */
export const BLOCK_COPY: Record<BlockReason, { title: string; body: string }> = {
  unknown: {
    title: "QR code not recognised",
    body: "This isn't a valid HackJam badge. Try again, or search by name below.",
  },
  other_event: {
    title: "Badge is for another event",
    body: "This badge isn't for this hackathon. Send them to an organizer.",
  },
  not_accepted: {
    title: "Not accepted",
    body: "They don't have a spot. Don't let them in; send them to an organizer.",
  },
  declined: {
    title: "Declined their spot",
    body: "They told us they're not coming. Send them to an organizer.",
  },
  not_checked_in: {
    title: "Not checked in yet",
    body: "Send them to check-in at the door first.",
  },
  already_scanned: {
    title: "QR code already scanned",
    body: "This badge was already scanned here.",
  },
};

export const WARNING_COPY: Record<ScanWarning, string> = {
  minor: "Under 18: check they have a signed waiver.",
  no_rsvp: "They never confirmed their RSVP.",
};

/** Badge tokens are 32 random bytes in base64url (src/lib/badge.ts). */
export function looksLikeBadgeToken(text: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(text);
}

export const CHECKPOINT_NAME_MAX = 60;

/** A meal or workshop name from the /admin/event form: trimmed, 1–60 characters. */
export function parseCheckpointName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name && name.length <= CHECKPOINT_NAME_MAX ? name : null;
}

export function parseCheckpointKind(raw: unknown): "MEAL" | "WORKSHOP" | null {
  return raw === "MEAL" || raw === "WORKSHOP" ? raw : null;
}

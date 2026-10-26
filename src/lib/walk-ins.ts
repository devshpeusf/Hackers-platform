import { randomUUID } from "node:crypto";

/**
 * The rules behind registering someone at the door (PLAT-56).
 *
 * Pure, no I/O, for the same reason src/lib/decisions.ts is: the interesting
 * part isn't the write, it's deciding which of three situations you're in, and
 * that's worth being able to test without a database.
 */

/**
 * A walk-in's Person needs a `discordId`, which is `String @unique` and
 * non-null — and a walk-in has no Discord account at all.
 *
 * So one is synthesised. Real ids come only from Discord's own `sub` on the
 * provider identity (see verifiedDiscordId), which is a numeric snowflake, so
 * a "walkin:" prefix can never collide with a real account, and every existing
 * lookup — isOrganizer, isVolunteerOrAbove, getApplication, hasApplied — keeps
 * working untouched.
 *
 * The alternative, making discordId nullable, would have been a security
 * change dressed up as a convenience: lookups are shaped like
 * `{ where: { person: { discordId } } }` and callers already treat a null id as
 * "not signed in", so a nullable column means a session with no Discord
 * identity starts matching walk-in rows.
 *
 * The prefix is also what makes these findable later, for anyone who wants to
 * join a walk-in up with the real account they sign in with afterwards.
 */
export const WALK_IN_ID_PREFIX = "walkin:";

export function newWalkInDiscordId(): string {
  return `${WALK_IN_ID_PREFIX}${randomUUID()}`;
}

export function isWalkInDiscordId(discordId: string): boolean {
  return discordId.startsWith(WALK_IN_ID_PREFIX);
}

/** Email is the only thing we can match a person on at the door. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * What registering this email at the door actually means.
 *
 * "Someone the scanner can't find" very often means someone who *did* apply —
 * their badge won't scan, or they never opened the email. Person.email is
 * unique and @@unique([personId, eventId]) exists, so treating every walk-in as
 * a fresh create throws a constraint error at the worst possible moment. These
 * are the three real cases:
 *
 * - `new-person`      — nobody by that email. Create person + application.
 * - `new-application` — known person, nothing for this event. Application only.
 * - `existing`        — they already have an application here. Create nothing;
 *                       show what they have and let staff admit them, which is
 *                       a decision on the existing row rather than a duplicate.
 */
export type WalkInCase =
  | { kind: "new-person" }
  | { kind: "new-application"; personId: string }
  | { kind: "existing"; personId: string; applicationId: string };

export function classifyWalkIn(
  person: { id: string; applications: { id: string; eventId: string }[] } | null,
  eventId: string,
): WalkInCase {
  if (!person) return { kind: "new-person" };

  const existing = person.applications.find((a) => a.eventId === eventId);
  if (existing) {
    return { kind: "existing", personId: person.id, applicationId: existing.id };
  }
  return { kind: "new-application", personId: person.id };
}

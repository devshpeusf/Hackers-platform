import "server-only";

import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { canEnterPortal } from "@/lib/portal-access";
import { CODE_ALPHABET, CODE_LENGTH, TEAM_MAX, normalizeInviteCode, normalizeTeamName } from "@/lib/team-rules";

/**
 * Hacker teams (/team). Informational only — official team registration
 * happens on Devpost — so the rules are kept simple:
 *
 * - Max TEAM_MAX members, one team per hacker per event.
 * - Only hackers who can use the portal (canEnterPortal) can create, join or
 *   rename. Leaving is always allowed.
 * - Members who drop out later (decline their RSVP, or lose their
 *   acceptance) stop counting toward the cap and disappear from the list, so
 *   their spot frees up — without the RSVP or decision code having to know
 *   teams exist.
 * - When the last counting member leaves, the team is deleted.
 * - No locking: teams can change any time.
 *
 * Every function takes a trusted application id, resolved by the caller
 * from the signed-in session — nothing here accepts an id from a browser.
 * Each change runs in a transaction that locks the application row first and
 * then the team row (always in that order, so two requests can't deadlock),
 * which is what makes the cap hold when two people join at the same moment.
 */

export { TEAM_MAX, TEAM_NAME_MAX, normalizeInviteCode, normalizeTeamName } from "@/lib/team-rules";

/** e.g. "HJ-7K3QPX". 31^6 ≈ 887 million possibilities. */
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `HJ-${code}`;
}

/**
 * Members who count toward the cap and show on the team: the same rule as
 * canEnterPortal, as a database filter. (A test checks the two agree.)
 */
export const COUNTING_MEMBER: Prisma.ApplicationWhereInput = {
  status: "ACCEPTED",
  rsvpStatus: { in: ["PENDING", "CONFIRMED"] },
};

export type TeamResult =
  | { ok: true }
  | {
      ok: false;
      error: "NOT_ELIGIBLE" | "ALREADY_IN_TEAM" | "NOT_IN_TEAM" | "NOT_FOUND" | "FULL" | "INVALID_NAME" | "INVALID_CODE";
      message: string;
    };

const fail = (error: Exclude<TeamResult, { ok: true }>["error"], message: string): TeamResult => ({
  ok: false,
  error,
  message,
});

async function lockApplication(tx: Prisma.TransactionClient, applicationId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Application" WHERE "id" = ${applicationId} FOR UPDATE
  `;
  if (!rows.length) return null;
  return tx.application.findUnique({
    where: { id: applicationId },
    select: { id: true, personId: true, eventId: true, teamId: true, status: true, rsvpStatus: true },
  });
}

async function lockTeam(tx: Prisma.TransactionClient, teamId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Team" WHERE "id" = ${teamId} FOR UPDATE`;
}

const countMembers = (tx: Prisma.TransactionClient, teamId: string) =>
  tx.application.count({ where: { teamId, ...COUNTING_MEMBER } });

/** Saves the creator's / joiner's Discord handle so teammates can see it. */
async function saveHandle(tx: Prisma.TransactionClient, personId: string, discordUsername: string | null) {
  if (discordUsername) await tx.person.update({ where: { id: personId }, data: { discordUsername } });
}

export async function createTeam(applicationId: string, rawName: unknown, discordUsername: string | null): Promise<TeamResult> {
  const parsed = normalizeTeamName(rawName);
  if (!parsed.ok) return fail("INVALID_NAME", parsed.error);

  return prisma.$transaction(async (tx) => {
    const app = await lockApplication(tx, applicationId);
    if (!app || !canEnterPortal(app)) return fail("NOT_ELIGIBLE", "Only accepted hackers can create a team.");
    if (app.teamId) return fail("ALREADY_IN_TEAM", "You're already on a team. Leave it first to start a new one.");

    const team = await tx.team.create({
      data: { name: parsed.name, inviteCode: generateInviteCode(), eventId: app.eventId },
      select: { id: true },
    });
    await tx.application.update({ where: { id: app.id }, data: { teamId: team.id } });
    await saveHandle(tx, app.personId, discordUsername);
    return { ok: true } as const;
  });
}

export async function joinTeam(applicationId: string, rawCode: unknown, discordUsername: string | null): Promise<TeamResult> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return fail("INVALID_CODE", "That doesn't look like an invite code. It should look like HJ-7K3QPX.");

  return prisma.$transaction(async (tx) => {
    const app = await lockApplication(tx, applicationId);
    if (!app || !canEnterPortal(app)) return fail("NOT_ELIGIBLE", "Only accepted hackers can join a team.");

    // Same event only: a code from another year's team doesn't work.
    const team = await tx.team.findFirst({ where: { inviteCode: code, eventId: app.eventId }, select: { id: true } });
    if (!team) return fail("NOT_FOUND", "No team has that code. Check it with your teammate.");
    if (app.teamId === team.id) return { ok: true } as const;
    if (app.teamId) return fail("ALREADY_IN_TEAM", "You're already on a team. Leave it first to join another.");

    await lockTeam(tx, team.id);
    if ((await countMembers(tx, team.id)) >= TEAM_MAX) {
      return fail("FULL", `That team already has ${TEAM_MAX} members.`);
    }
    await tx.application.update({ where: { id: app.id }, data: { teamId: team.id } });
    await saveHandle(tx, app.personId, discordUsername);
    return { ok: true } as const;
  });
}

export async function renameTeam(applicationId: string, rawName: unknown): Promise<TeamResult> {
  const parsed = normalizeTeamName(rawName);
  if (!parsed.ok) return fail("INVALID_NAME", parsed.error);

  return prisma.$transaction(async (tx) => {
    const app = await lockApplication(tx, applicationId);
    if (!app || !canEnterPortal(app)) return fail("NOT_ELIGIBLE", "Only accepted hackers can rename a team.");
    if (!app.teamId) return fail("NOT_IN_TEAM", "You're not on a team.");
    await lockTeam(tx, app.teamId);
    await tx.team.update({ where: { id: app.teamId }, data: { name: parsed.name } });
    return { ok: true } as const;
  });
}

/** Always allowed — leaving shouldn't depend on still being accepted. */
export async function leaveTeam(applicationId: string): Promise<TeamResult> {
  return prisma.$transaction(async (tx) => {
    const app = await lockApplication(tx, applicationId);
    if (!app?.teamId) return { ok: true } as const;
    const teamId = app.teamId;

    await tx.application.update({ where: { id: app.id }, data: { teamId: null } });
    await lockTeam(tx, teamId);
    // Nobody left who counts: delete it. Any dropped-out members still
    // pointing at it are cleared by the foreign key (ON DELETE SET NULL).
    if ((await countMembers(tx, teamId)) === 0) await tx.team.delete({ where: { id: teamId } });
    return { ok: true } as const;
  });
}

export type TeamView = {
  name: string;
  inviteCode: string;
  members: { name: string; discordUsername: string | null; isYou: boolean }[];
  full: boolean;
};

/**
 * The viewer's team for display: counting members only, oldest first, and
 * nothing but names and handles — no ids, emails or application details.
 */
export async function getTeamView(applicationId: string): Promise<TeamView | null> {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, select: { teamId: true } });
  if (!app?.teamId) return null;

  const team = await prisma.team.findUnique({
    where: { id: app.teamId },
    select: {
      name: true,
      inviteCode: true,
      members: {
        where: COUNTING_MEMBER,
        orderBy: { createdAt: "asc" },
        select: { id: true, person: { select: { firstName: true, lastName: true, discordUsername: true } } },
      },
    },
  });
  if (!team) return null;

  const members = team.members.map((m) => ({
    name: `${m.person.firstName} ${m.person.lastName}`.trim(),
    discordUsername: m.person.discordUsername,
    isYou: m.id === applicationId,
  }));
  return { name: team.name, inviteCode: team.inviteCode, members, full: members.length >= TEAM_MAX };
}

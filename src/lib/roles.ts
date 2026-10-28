import "server-only";

import { prisma } from "@/lib/prisma";
import type { PersonRole } from "@/generated/prisma/client";

/**
 * Changing who's staff (/admin/roles). Organizer-only; the caller resolves
 * the acting organizer from the session.
 *
 * Rules:
 * - Only the three real roles.
 * - Nobody changes their own role. That stops accidental self-lockout, and
 *   it also guarantees an organizer always remains: the one acting is never
 *   demoted by their own action.
 * - Every change records who made it and when (roleChangedBy/At), the audit
 *   trail for who handed out access to applicant data.
 */

export const ROLES = ["APPLICANT", "VOLUNTEER", "ORGANIZER"] as const satisfies readonly PersonRole[];

export function parseRole(raw: unknown): PersonRole | null {
  return typeof raw === "string" && (ROLES as readonly string[]).includes(raw) ? (raw as PersonRole) : null;
}

export type RoleResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: "INVALID_ROLE" | "SELF" | "NOT_FOUND"; message: string };

export async function setPersonRole(actorPersonId: string, targetPersonId: string, rawRole: unknown): Promise<RoleResult> {
  const role = parseRole(rawRole);
  if (!role) return { ok: false, error: "INVALID_ROLE", message: "That isn't a role." };
  if (actorPersonId === targetPersonId) {
    return { ok: false, error: "SELF", message: "You can't change your own role. Ask another organizer." };
  }

  const target = await prisma.person.findUnique({ where: { id: targetPersonId }, select: { role: true } });
  if (!target) return { ok: false, error: "NOT_FOUND", message: "That person doesn't exist." };
  if (target.role === role) return { ok: true, changed: false };

  await prisma.person.update({
    where: { id: targetPersonId },
    data: { role, roleChangedAt: new Date(), roleChangedById: actorPersonId },
  });
  return { ok: true, changed: true };
}

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  role: PersonRole;
  roleChangedAt: Date | null;
  roleChangedBy: string | null;
};

const ROW_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  roleChangedAt: true,
  roleChangedBy: { select: { firstName: true, lastName: true } },
} as const;

type Raw = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: PersonRole;
  roleChangedAt: Date | null;
  roleChangedBy: { firstName: string; lastName: string } | null;
};

const toRow = (p: Raw): PersonRow => ({
  id: p.id,
  name: `${p.firstName} ${p.lastName}`.trim(),
  email: p.email,
  role: p.role,
  roleChangedAt: p.roleChangedAt,
  roleChangedBy: p.roleChangedBy ? `${p.roleChangedBy.firstName} ${p.roleChangedBy.lastName}`.trim() : null,
});

/** Everyone with a staff role, organizers first. */
export async function listStaff(): Promise<PersonRow[]> {
  const people = await prisma.person.findMany({
    where: { role: { in: ["ORGANIZER", "VOLUNTEER"] } },
    orderBy: { firstName: "asc" },
    select: ROW_SELECT,
  });
  // Sorted here, not by the database: Postgres orders enums by when each
  // value was added, which isn't organizers-first.
  const rank = (role: PersonRole) => (role === "ORGANIZER" ? 0 : 1);
  return people.sort((a, b) => rank(a.role) - rank(b.role)).map((p) => toRow(p));
}

/** Anyone by name or email, to promote. Every word has to match somewhere. */
export async function searchPeople(query: string): Promise<PersonRow[]> {
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!terms.length) return [];
  const people = await prisma.person.findMany({
    where: {
      AND: terms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
          { email: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: { firstName: "asc" },
    take: 25,
    select: ROW_SELECT,
  });
  return people.map((p) => toRow(p));
}

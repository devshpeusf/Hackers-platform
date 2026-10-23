import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, RsvpStatus } from "@/generated/prisma/client";

/** A credential check, not a session or permission to overwrite an RSVP. */
export type RsvpTokenResolution =
  | { status: "VALID"; applicationId: string; rsvpStatus: RsvpStatus }
  | { status: "INVALID" | "EXPIRED" | "REVOKED" | "NO_LONGER_ACCEPTED" };

/** Independent of badges and sessions: 256 random bits, 43 URL-safe characters. */
export function generateRsvpToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic lookup hash. Random bearer credentials do not need a salt. */
export function hashRsvpToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Serialize issuing and revoking invitations for the same application. */
async function lockApplication(tx: Prisma.TransactionClient, applicationId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Application" WHERE "id" = ${applicationId} FOR UPDATE
  `;
  return rows.length > 0;
}

/**
 * Trusted server callers only: the email worker already owns a server-resolved
 * application ID. A public endpoint must resolve its bearer token instead.
 *
 * Keep the raw credential only in the caller's memory/email, never in the DB
 * or logs. Retries issue additional credentials without revoking earlier ones.
 */
export async function issueRsvpToken(applicationId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockApplication(tx, applicationId))) {
      throw new Error("Application not found for RSVP");
    }

    const application = await tx.application.findUnique({
      where: { id: applicationId },
      select: { status: true, event: { select: { startDate: true } } },
    });
    if (!application || application.status !== "ACCEPTED") {
      throw new Error("Only accepted applications can receive RSVP invitations");
    }

    const rawToken = generateRsvpToken();
    await tx.rsvpToken.create({
      data: {
        applicationId,
        tokenHash: hashRsvpToken(rawToken),
        expiresAt: application.event.startDate,
      },
      select: { id: true },
    });
    return rawToken;
  });
}

/**
 * The only public-facing lookup input is the raw credential. Malformed input
 * is invalid without a DB query; database failures still propagate as errors.
 *
 * The resolved ID stays server-side. VALID can include an already-recorded
 * RSVP so the page can show a receipt. The mutation below rechecks
 * eligibility and atomically enforces PENDING; this read never changes state.
 */
export async function resolveRsvpToken(rawToken: unknown): Promise<RsvpTokenResolution> {
  return resolveWithClient(rawToken, prisma);
}

async function resolveWithClient(
  rawToken: unknown,
  client: Pick<Prisma.TransactionClient, "rsvpToken">,
): Promise<RsvpTokenResolution> {
  if (typeof rawToken !== "string" || rawToken.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
    return { status: "INVALID" };
  }

  const token = await client.rsvpToken.findUnique({
    where: { tokenHash: hashRsvpToken(rawToken) },
    select: {
      expiresAt: true,
      revokedAt: true,
      application: { select: { id: true, status: true, rsvpStatus: true } },
    },
  });
  if (!token) return { status: "INVALID" };
  if (token.revokedAt) return { status: "REVOKED" };
  if (new Date().getTime() >= token.expiresAt.getTime()) return { status: "EXPIRED" };
  if (token.application.status !== "ACCEPTED") return { status: "NO_LONGER_ACCEPTED" };

  return {
    status: "VALID",
    applicationId: token.application.id,
    rsvpStatus: token.application.rsvpStatus,
  };
}

export type RsvpResponseResult =
  | { status: "CONFIRMED" | "DECLINED" }
  | { status: "INVALID_CHOICE" | "UNAVAILABLE" };

/**
 * Public credential + choice only. Lock the same application as issuance and
 * revocation, then revalidate after waiting: the initial lookup is not enough.
 * Never return the resolved ID or token to the browser in an action result.
 */
export async function recordRsvpResponse(
  rawToken: unknown,
  choice: unknown,
): Promise<RsvpResponseResult> {
  if (choice !== "CONFIRMED" && choice !== "DECLINED") return { status: "INVALID_CHOICE" };
  if (typeof rawToken !== "string") return { status: "UNAVAILABLE" };

  const initial = await resolveRsvpToken(rawToken);
  if (initial.status !== "VALID") return { status: "UNAVAILABLE" };

  return prisma.$transaction(async (tx) => {
    if (!(await lockApplication(tx, initial.applicationId))) return { status: "UNAVAILABLE" };

    const current = await resolveWithClient(rawToken, tx);
    if (current.status !== "VALID" || current.applicationId !== initial.applicationId) {
      return { status: "UNAVAILABLE" };
    }
    if (current.rsvpStatus !== "PENDING") return { status: current.rsvpStatus };

    const respondedAt = new Date();
    const updated = await tx.application.updateMany({
      where: {
        id: current.applicationId,
        status: "ACCEPTED",
        rsvpStatus: "PENDING",
        rsvpTokens: {
          some: {
            tokenHash: hashRsvpToken(rawToken),
            revokedAt: null,
            expiresAt: { gt: respondedAt },
          },
        },
      },
      data: { rsvpStatus: choice, rsvpRespondedAt: respondedAt },
    });
    if (updated.count === 1) return { status: choice };

    // If no transition happened, report only a still-authorized receipt.
    const actual = await resolveWithClient(rawToken, tx);
    return actual.status === "VALID" && actual.rsvpStatus !== "PENDING"
      ? { status: actual.rsvpStatus }
      : { status: "UNAVAILABLE" };
  });
}

/**
 * Trusted application ID only. Soft-revoke unexpired, unrevoked invitations;
 * repeated calls preserve previous revocation times and return zero changes.
 * Pass an existing transaction when later coupling this to a decision change.
 */
export async function revokeRsvpTokens(
  applicationId: string,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const revoke = async (client: Prisma.TransactionClient) => {
    if (!(await lockApplication(client, applicationId))) return 0;
    const now = new Date();
    const result = await client.rsvpToken.updateMany({
      where: { applicationId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return result.count;
  };

  return tx ? revoke(tx) : prisma.$transaction(revoke);
}

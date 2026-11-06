import "server-only";

import { prisma } from "@/lib/prisma";
import type { SignInFailureReason } from "@/lib/signin-guard";

/**
 * Failed Discord sign-ins, kept in our own database (SignInFailure) because
 * the hosted logs don't last long enough to look into a hacker's report:
 * about an hour on Vercel Hobby, a day on Supabase free.
 *
 * No personal data goes in: no Discord id, name, email or full user agent.
 */

export type SignInFailureInput = {
  reason: SignInFailureReason | "missing_code";
  code?: string | null;
  description?: string | null;
  browser: string;
  verifier: boolean;
  retried?: boolean;
};

const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

/**
 * Records one failure. Never throws: a broken log write must not stop the
 * person being sent on to the message (or the retry).
 */
export async function recordSignInFailure(input: SignInFailureInput): Promise<void> {
  const row = {
    reason: input.reason,
    code: clip(input.code, 100),
    description: clip(input.description, 300),
    browser: input.browser,
    verifier: input.verifier,
    retried: input.retried ?? false,
  };
  // Still logged, for watching Vercel's live logs while someone tries.
  console.warn(
    `[auth] callback failed reason=${row.reason} code=${row.code ?? "-"} browser=${row.browser} verifier=${row.verifier ? "present" : "missing"} retried=${row.retried}`,
  );
  try {
    await prisma.signInFailure.create({ data: row });
  } catch (e) {
    console.error("[auth] could not record sign-in failure:", e instanceof Error ? e.message : String(e));
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last 30 days, for /admin/sign-in-issues: counts by reason and the latest rows. */
export async function signInFailureReport(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [byReason, recent] = await Promise.all([
    prisma.signInFailure.groupBy({
      by: ["reason"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.signInFailure.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return {
    counts: byReason
      .map((r) => ({ reason: r.reason, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    recent,
  };
}

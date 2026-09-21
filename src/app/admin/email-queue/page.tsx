import { redirect, notFound } from "next/navigation";
import clsx from "@/lib/clsx";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { isOrganizer } from "@/lib/organizer";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import { resetEmailQueueRow } from "./actions";

/**
 * Visibility into the confirmation-email send queue (PLAT-23 follow-up) —
 * counts by status, and every FAILED row with enough to act on it. Not
 * linked from anywhere in the app's own nav; organizers reach it by URL.
 *
 * Organizer-only. Not signed in -> straight to sign-in; signed in but not
 * an organizer -> a plain 404, so the page doesn't confirm its own
 * existence (or that applicant PII lives behind it) to someone poking at
 * the URL. After signing in there's no return-to-this-page redirect —
 * deliberately skipped for a page only organizers open, by URL, now and
 * then; they just navigate back here.
 */
export default async function EmailQueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const identity = toApplicantIdentity(user);
  if (!(await isOrganizer(identity.discordId))) notFound();

  const [counts, failedRows] = await Promise.all([
    prisma.emailQueue.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.emailQueue.findMany({
      where: { status: "FAILED" },
      include: { application: { include: { person: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const countByStatus = { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0 };
  for (const row of counts) countByStatus[row.status] = row._count.status;

  return (
    <div className="min-h-screen bg-surface-bg px-6 py-8 md:px-11 md:py-10">
      <div className="mx-auto max-w-[900px]">
        <h1 className="mb-1 font-pixel text-lg leading-[1.7] text-text-primary">EMAIL QUEUE</h1>
        <p className="mb-7 text-[13px] text-text-muted">Confirmation email send status.</p>

        <div className="mb-8 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <StatCard label="PENDING" value={countByStatus.PENDING} color="var(--color-accent-teal)" />
          <StatCard label="SENDING" value={countByStatus.SENDING} color="var(--color-terminal-yellow)" />
          <StatCard label="SENT" value={countByStatus.SENT} color="var(--color-terminal-green)" />
          <StatCard label="FAILED" value={countByStatus.FAILED} color="var(--color-terminal-red)" />
        </div>

        <h2 className="mb-3 font-pixel text-[11px] tracking-widest text-terminal-red">
          // FAILED — {failedRows.length}
        </h2>

        {failedRows.length === 0 ? (
          <PixelCard className="p-6 text-[13px] text-text-muted">Nothing failed. Nice.</PixelCard>
        ) : (
          <div className="flex flex-col gap-3">
            {failedRows.map((row) => (
              <PixelCard key={row.id} borderColor="var(--color-terminal-red)" className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <PixelChip color="var(--color-terminal-red)">{row.emailType}</PixelChip>
                      <span className="text-[12px] font-bold text-text-primary">
                        {row.application.person.email}
                      </span>
                    </div>
                    <p className="break-words font-mono text-[11px] leading-[1.6] text-text-dim">
                      {row.lastError ?? "No error recorded."}
                    </p>
                    <p className="mt-1.5 text-[10px] text-text-faintest">
                      {row.attempts} attempt{row.attempts === 1 ? "" : "s"} · queued{" "}
                      {row.createdAt.toLocaleString()}
                    </p>
                  </div>
                  <form action={resetEmailQueueRow} className="shrink-0">
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className="pixel-btn-outline bg-surface-bg px-4 py-2 font-body text-[11px] font-bold tracking-wide text-text-primary"
                    >
                      RETRY
                    </button>
                  </form>
                </div>
              </PixelCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <PixelCard borderColor={color} className="p-4">
      <div className={clsx("font-pixel text-[9px] tracking-widest")} style={{ color }}>
        {label}
      </div>
      <div className="mt-2 font-pixel text-xl text-text-primary">{value}</div>
    </PixelCard>
  );
}

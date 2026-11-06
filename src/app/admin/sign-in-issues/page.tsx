import { requireOrganizer } from "@/lib/organizer";
import { signInFailureReport } from "@/lib/signin-failures";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";

/**
 * Failed Discord sign-ins from the last 30 days (/admin/sign-in-issues).
 * Organizer-only. When a hacker says "it keeps sending me back to sign in",
 * ask roughly when they tried and find their row here: the reason says which
 * problem it was. No personal data is stored, so rows are matched by time
 * and device, not by name.
 */

const REASONS: Record<string, { label: string; meaning: string; color: string }> = {
  verify_email: {
    label: "Unverified Discord email",
    meaning: "Their Discord email isn't verified. They need to verify it in Discord, then sign in again.",
    color: "var(--color-accent-amber)",
  },
  no_email: {
    label: "No Discord email",
    meaning: "Their Discord account has no email. They need to add and verify one in Discord.",
    color: "var(--color-accent-amber)",
  },
  missing_verifier: {
    label: "Cookie didn't come back",
    meaning:
      "They came back in a different browser than they started in (often the Discord or Instagram app). Retried automatically once.",
    color: "var(--color-accent-pink)",
  },
  cancelled: {
    label: "Cancelled",
    meaning: "They pressed Cancel on Discord's screen.",
    color: "var(--color-text-dim)",
  },
  failed: {
    label: "Other",
    meaning: "Didn't finish for another reason (see the code). Trying again usually works.",
    color: "var(--color-terminal-red)",
  },
  missing_code: {
    label: "No code",
    meaning: "Arrived at the callback without a code. Usually someone opening the callback link directly.",
    color: "var(--color-text-dim)",
  },
};

const reasonInfo = (reason: string) => REASONS[reason] ?? REASONS.failed;

export default async function SignInIssuesPage() {
  await requireOrganizer();
  const { counts, recent } = await signInFailureReport();

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1180px]">
        <h1 className="mb-2 font-pixel text-xl leading-[1.6] text-text-primary md:text-2xl">SIGN-IN ISSUES</h1>
        <p className="mb-8 max-w-[760px] card-text text-text-muted">
          Discord sign-ins that didn&apos;t finish, from the last 30 days. No names or emails are stored: find someone&apos;s
          attempt by the time they tried and their device.
        </p>

        <PixelCard className="mb-8 card-pad">
          <span className="card-title text-accent-teal">BY REASON</span>
          {counts.length === 0 ? (
            <p className="mt-4 card-meta text-text-dim">No failed sign-ins in the last 30 days.</p>
          ) : (
            <ul className="mt-4 flex flex-col">
              {counts.map(({ reason, count }) => {
                const info = reasonInfo(reason);
                return (
                  <li key={reason} className="flex items-start gap-4 border-t border-text-primary/8 py-3">
                    <span className="w-10 shrink-0 card-text font-bold tabular-nums text-text-primary">{count}</span>
                    <div className="min-w-0">
                      <div className="card-text font-bold text-text-primary">{info.label}</div>
                      <div className="card-meta text-text-muted">{info.meaning}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </PixelCard>

        <PixelCard className="card-pad">
          <span className="card-title text-accent-teal">LATEST · {recent.length}</span>
          {recent.length === 0 ? (
            <p className="mt-4 card-meta text-text-dim">Nothing yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col">
              {recent.map((row) => {
                const info = reasonInfo(row.reason);
                return (
                  <li key={row.id} className="flex flex-col gap-1.5 border-t border-text-primary/8 py-4">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <PixelChip color={info.color}>{info.label.toUpperCase()}</PixelChip>
                      <span className="card-meta tabular-nums text-text-muted">
                        {row.createdAt.toLocaleString("en-US", {
                          timeZone: "America/New_York",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="card-meta text-text-muted">{row.browser}</span>
                      <span className="card-meta text-text-dim">
                        cookie {row.verifier ? "present" : "missing"}
                        {row.retried && " · retried automatically"}
                      </span>
                    </div>
                    {(row.code || row.description) && (
                      <div className="card-meta break-words text-text-dim">
                        {row.code}
                        {row.code && row.description && " · "}
                        {row.description}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PixelCard>
      </div>
    </div>
  );
}

import { requireOrganizer } from "@/lib/organizer";
import { AUDIENCES, AUDIENCE_KEYS, audienceCounts, listBroadcasts } from "@/lib/broadcast";
import PixelCard from "@/components/ui/PixelCard";
import Composer from "./composer";

/**
 * Email groups of hackers (/admin/email). Organizer-only. Announcements are
 * queued, not sent on the spot: the scheduled job sends them after
 * transactional email, so on Resend's free tier they never delay an
 * acceptance — a big one can take a few days to reach everyone.
 */
export default async function AdminEmailPage() {
  await requireOrganizer();
  const [counts, history] = await Promise.all([audienceCounts(), listBroadcasts()]);
  const audiences = AUDIENCE_KEYS.map((key) => ({
    key,
    label: AUDIENCES[key].label,
    description: AUDIENCES[key].description,
    count: counts[key],
  }));

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1180px]">
        <h1 className="mb-2 font-pixel text-xl leading-[1.6] text-text-primary md:text-2xl">EMAIL HACKERS</h1>
        <p className="mb-8 max-w-[760px] card-text text-text-muted">
          Send an announcement to a group. Emails are queued and go out with the scheduler, after confirmations and
          decisions. A big send can take a few days on the free email plan.
        </p>

        <PixelCard className="mb-8 card-pad">
          <Composer audiences={audiences} />
        </PixelCard>

        <PixelCard className="card-pad">
          <span className="card-title text-accent-teal">SENT · {history.length}</span>
          {history.length === 0 ? (
            <p className="mt-4 card-meta text-text-dim">Nothing sent yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col">
              {history.map((b) => (
                <li key={b.id} className="flex flex-col gap-2 border-t border-text-primary/8 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="card-text font-bold break-words text-text-primary">{b.subject}</div>
                    <div className="card-meta text-text-muted">
                      {b.audience} · by {b.sentBy} ·{" "}
                      {b.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-4 card-meta tabular-nums">
                    <span className="text-accent-teal">{b.sent} sent</span>
                    <span className="text-accent-amber">{b.pending} waiting</span>
                    <span className={b.failed ? "text-terminal-red" : "text-text-dim"}>{b.failed} failed</span>
                    <span className="text-text-muted">of {b.total}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PixelCard>
      </div>
    </div>
  );
}

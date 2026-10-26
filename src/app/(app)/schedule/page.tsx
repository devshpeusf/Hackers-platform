import PageHeading from "@/components/ui/PageHeading";
import PixelCard from "@/components/ui/PixelCard";
import TerminalWindow from "@/components/ui/TerminalWindow";
import { getCurrentHacker } from "@/lib/current-hacker";
import { parseSchedule } from "@/lib/event-schedule";

/**
 * The run of show, from the hacker's own Event row (Event.schedule) — edited
 * at /admin/event or in Supabase, no deploy. Rows show in the order they're
 * stored. Empty shows an "in progress" notice.
 */
export default async function SchedulePage() {
  const { application } = await getCurrentHacker();
  const rows = parseSchedule(application.event.schedule);

  return (
    <div>
      <PageHeading title="SCHEDULE" />

      {rows.length === 0 ? (
        <ScheduleInProgress />
      ) : (
        <TerminalWindow filename="RUN-OF-SHOW.LOG" className="max-w-[900px]">
          <ol className="px-7 pt-3 pb-6 lg:px-8">
            {rows.map((row, i) => (
              <li
                key={`${i}-${row.time}`}
                className={"flex items-baseline gap-6 py-4" + (i < rows.length - 1 ? " border-b border-text-primary/7" : "")}
              >
                <span
                  className={
                    "w-[110px] shrink-0 card-label " +
                    (row.highlighted ? "text-accent-teal" : "text-text-dim")
                  }
                >
                  {row.time}
                </span>
                <span className={"min-w-0 break-words card-text " + (row.highlighted ? "font-bold text-text-primary" : "text-text-secondary")}>
                  {row.label}
                </span>
              </li>
            ))}
          </ol>
        </TerminalWindow>
      )}

      <p className="mt-5 max-w-[900px] card-meta text-text-faintest">
        Times can shift on the day. Live changes are announced in Discord.
      </p>
    </div>
  );
}

/** Shown until an organizer adds the run of show at /admin/event. */
function ScheduleInProgress() {
  return (
    <PixelCard borderColor="var(--color-accent-amber)" className="max-w-[900px] card-pad">
      <div className="flex flex-wrap items-center gap-3">
        <span className="card-title text-accent-amber">RUN OF SHOW</span>
        <span className="border border-accent-amber/60 px-2 py-1 font-pixel text-[7px] tracking-widest text-accent-amber">
          IN PROGRESS
        </span>
      </div>
      <p className="mt-3 max-w-[620px] card-text text-text-secondary">
        We&apos;re still finalizing the schedule. It&apos;ll show up right here once it&apos;s ready.
      </p>
      <div aria-hidden="true" className="mt-4 flex items-center gap-1">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className={i < 5 ? "h-2.5 w-4 bg-accent-amber motion-safe:animate-pulse" : "h-2.5 w-4 bg-text-primary/10"}
            style={i < 5 ? { animationDelay: `${i * 150}ms` } : undefined}
          />
        ))}
        <span className="ml-2 font-pixel text-[8px] text-text-dim motion-safe:animate-pulse">BUILDING…</span>
      </div>
    </PixelCard>
  );
}

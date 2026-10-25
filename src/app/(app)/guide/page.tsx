import PageHeading from "@/components/ui/PageHeading";
import PixelCard from "@/components/ui/PixelCard";
import { getCurrentHacker } from "@/lib/current-hacker";
import { DEFAULT_CODE_OF_CONDUCT_URL, mapsUrl } from "@/lib/event-guide";

/**
 * The hacker guide, from the hacker's own Event row — edited at /admin/event
 * or in Supabase, no deploy. Anything not filled in yet shows "TBA".
 *
 * The full guide is a separate public document (hackerGuideUrl); the cards
 * here are only the day-of essentials. Until that link is set, the top of the
 * page says the full guide is still being put together.
 */
export default async function GuidePage() {
  const { application } = await getCurrentHacker();
  const event = application.event;

  return (
    <div>
      <PageHeading title="HACKER GUIDE" />

      <div className="mb-6 max-w-[900px]">
        {event.hackerGuideUrl ? <FullGuideLink url={event.hackerGuideUrl} /> : <FullGuideInProgress />}
      </div>

      <div className="grid max-w-[900px] grid-cols-1 gap-6 sm:grid-cols-2">
        <PixelCard borderColor="var(--color-accent-teal)" className="p-6">
          <span className="font-pixel text-[8px] tracking-wide text-accent-teal">VENUE &amp; PARKING</span>
          <div className="mt-3.5 flex flex-col gap-1 text-[13px] leading-[1.8]">
            <span>{event.venueName ?? <Tba />}</span>
            {event.venueAddress && (
              <a
                href={mapsUrl(event.venueAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-teal underline-offset-4 hover:underline"
              >
                {event.venueAddress} &rarr;
              </a>
            )}
            <span className="whitespace-pre-line text-text-secondary">
              {event.parkingInfo ?? (
                <>
                  Parking: <Tba />
                </>
              )}
            </span>
          </div>
        </PixelCard>

        <PixelCard borderColor="var(--color-accent-purple)" className="p-6">
          <span className="font-pixel text-[8px] tracking-wide text-accent-purple-light">WIFI</span>
          <div className="mt-3.5 whitespace-pre-line text-[13px] leading-[1.8]">{event.wifiInfo ?? <Tba />}</div>
        </PixelCard>

        {/* Hidden rather than "TBA" when empty: an empty checklist says nothing useful. */}
        {event.whatToBring.length > 0 && (
          <PixelCard borderColor="var(--color-accent-magenta)" className="p-6">
            <span className="font-pixel text-[8px] tracking-wide text-accent-pink-light">WHAT TO BRING</span>
            <ul className="mt-3.5 list-disc pl-5 text-[13px] leading-[1.9] marker:text-accent-pink-light">
              {event.whatToBring.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </PixelCard>
        )}

        <PixelCard borderColor="var(--color-accent-amber)" className="p-6">
          <span className="font-pixel text-[8px] tracking-wide text-accent-amber">CODE OF CONDUCT</span>
          <div className="mt-3.5 text-[13px] leading-[1.8]">
            {/* Per project brief: HackJam is an MLH Hack Day, not a Member Event. */}
            HackJam is an MLH Hack Day. All hackers agree to the{" "}
            <a
              href={event.codeOfConductUrl ?? DEFAULT_CODE_OF_CONDUCT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-amber underline-offset-4 hover:underline"
            >
              MLH Code of Conduct
            </a>
            .
          </div>
        </PixelCard>
      </div>
    </div>
  );
}

function FullGuideLink({ url }: { url: string }) {
  return (
    <PixelCard borderColor="var(--color-accent-pink)" className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <span className="font-pixel text-[8px] tracking-wide text-accent-pink">FULL HACKER GUIDE</span>
        <p className="mt-2.5 max-w-[460px] text-[13px] leading-[1.8] text-text-secondary">
          Everything beyond the essentials below, in one document.
        </p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="pixel-btn-solid inline-flex shrink-0 self-start px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg sm:self-auto"
      >
        READ THE FULL GUIDE &rarr;
      </a>
    </PixelCard>
  );
}

/** Shown until an organizer adds the guide link at /admin/event. */
function FullGuideInProgress() {
  return (
    <PixelCard borderColor="var(--color-accent-amber)" className="p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-pixel text-[8px] tracking-wide text-accent-amber">FULL HACKER GUIDE</span>
        <span className="border border-accent-amber/60 px-2 py-1 font-pixel text-[7px] tracking-widest text-accent-amber">
          IN PROGRESS
        </span>
      </div>
      <p className="mt-3 max-w-[560px] text-[13px] leading-[1.8] text-text-secondary">
        We&apos;re still putting the full guide together. It&apos;ll show up right here once it&apos;s ready. The
        essentials below are up to date.
      </p>
      {/* A loading bar that never finishes, on purpose: it says "being built"
          without promising a date. Static for anyone who prefers reduced motion. */}
      <div aria-hidden="true" className="mt-4 flex items-center gap-1">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className={
              i < 5
                ? "h-2.5 w-4 bg-accent-amber motion-safe:animate-pulse"
                : "h-2.5 w-4 bg-text-primary/10"
            }
            style={i < 5 ? { animationDelay: `${i * 150}ms` } : undefined}
          />
        ))}
        <span className="ml-2 font-pixel text-[8px] text-text-dim motion-safe:animate-pulse">BUILDING…</span>
      </div>
    </PixelCard>
  );
}

function Tba() {
  return <span className="text-text-dim">TBA</span>;
}

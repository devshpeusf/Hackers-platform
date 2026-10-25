import PageHeading from "@/components/ui/PageHeading";
import PixelCard from "@/components/ui/PixelCard";
import { getCurrentHacker } from "@/lib/current-hacker";
import { DEFAULT_CODE_OF_CONDUCT_URL, mapsUrl, parseLocations } from "@/lib/event-guide";

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
  const locations = parseLocations(event.locations);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="HACKER GUIDE" />

      {event.hackerGuideUrl ? <FullGuideLink url={event.hackerGuideUrl} /> : <FullGuideInProgress />}

      {/* Two columns on wide screens: venue (what people look up first) and the
          code of conduct on the left, wifi and what to bring on the right. Both
          columns stretch to the same height, and the cards marked flex-1 take
          up the difference, so the bottoms line up. One column below lg. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <PixelCard borderColor="var(--color-accent-teal)" className="flex-1 p-7 lg:p-8">
            <span className="font-pixel text-[10px] tracking-wide text-accent-teal">VENUE &amp; PARKING</span>
            <dl className="mt-5 flex flex-col">
              {locations.length === 0 ? (
                <Row label="VENUE">
                  <Tba />
                </Row>
              ) : (
                locations.map((loc, i) => (
                  <Row key={`${i}-${loc.label}`} label={loc.label.toUpperCase()}>
                    <span className="text-[17px] font-bold text-text-primary">{loc.place}</span>
                    {loc.note && <span className="text-[14px] leading-[1.7] text-text-secondary">{loc.note}</span>}
                    {loc.address && (
                      <a
                        href={mapsUrl(loc.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[14px] text-accent-teal underline-offset-4 hover:underline"
                      >
                        {loc.address} &rarr;
                      </a>
                    )}
                  </Row>
                ))
              )}
              <Row label="PARKING">
                {event.parkingInfo ? (
                  <span className="whitespace-pre-line text-[15px] leading-[1.7] text-text-secondary">{event.parkingInfo}</span>
                ) : (
                  <>
                    <span className="text-[15px] font-bold text-accent-amber">To be announced</span>
                    <span className="text-[14px] leading-[1.7] text-text-muted">
                      We&apos;ll post parking details here before the event.
                    </span>
                  </>
                )}
              </Row>
            </dl>
          </PixelCard>

          <PixelCard borderColor="var(--color-accent-amber)" className="p-7 lg:p-8">
            <span className="font-pixel text-[10px] tracking-wide text-accent-amber">CODE OF CONDUCT</span>
            <div className="mt-4 text-[15px] leading-[1.8]">
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

        <div className="flex flex-col gap-6">
          <PixelCard borderColor="var(--color-accent-purple)" className="flex-1 p-7 lg:p-8">
            <span className="font-pixel text-[10px] tracking-wide text-accent-purple-light">WIFI</span>
            <div className="mt-4 whitespace-pre-line text-[15px] leading-[1.8]">{event.wifiInfo ?? <Tba />}</div>
          </PixelCard>

          {event.whatToBring.length > 0 && (
            <PixelCard borderColor="var(--color-accent-magenta)" className="flex-1 p-7 lg:p-8">
              <span className="font-pixel text-[10px] tracking-wide text-accent-pink-light">WHAT TO BRING</span>
              <ul className="mt-4 list-disc pl-5 text-[15px] leading-[1.9] marker:text-accent-pink-light">
                {event.whatToBring.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </PixelCard>
          )}
        </div>
      </div>
    </div>
  );
}

/** One labelled line in the venue card: the label in a fixed column, details beside it. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-text-primary/7 py-5 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:gap-6">
      <dt className="shrink-0 pt-1 font-pixel text-[9px] tracking-widest text-text-muted sm:w-[150px]">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5">{children}</dd>
    </div>
  );
}

function FullGuideLink({ url }: { url: string }) {
  return (
    <PixelCard borderColor="var(--color-accent-pink)" className="flex flex-col gap-4 p-7 lg:p-8 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <span className="font-pixel text-[10px] tracking-wide text-accent-pink">FULL HACKER GUIDE</span>
        <p className="mt-2.5 max-w-[460px] text-[15px] leading-[1.8] text-text-secondary">
          Everything beyond the essentials below, in one document.
        </p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="pixel-btn-solid inline-flex shrink-0 self-start px-[26px] py-[13px] font-body text-[12px] font-bold tracking-wide text-surface-bg sm:self-auto"
      >
        READ THE FULL GUIDE &rarr;
      </a>
    </PixelCard>
  );
}

/** Shown until an organizer adds the guide link at /admin/event. */
function FullGuideInProgress() {
  return (
    <PixelCard borderColor="var(--color-accent-amber)" className="p-7 lg:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-pixel text-[10px] tracking-wide text-accent-amber">FULL HACKER GUIDE</span>
        <span className="border border-accent-amber/60 px-2 py-1 font-pixel text-[7px] tracking-widest text-accent-amber">
          IN PROGRESS
        </span>
      </div>
      <p className="mt-3 max-w-[560px] text-[15px] leading-[1.8] text-text-secondary">
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

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import PixelCard from "@/components/ui/PixelCard";
import GuideForm from "./guide-form";
import ScheduleForm from "./schedule-form";
import { parseSchedule } from "@/lib/event-schedule";
import LocationsForm from "./locations-form";
import { parseLocations } from "@/lib/event-guide";
import Checkpoints from "./checkpoints";

/**
 * Organizer editor for the hacker guide (full guide link, parking, wifi, what
 * to bring, code of conduct), its locations, the schedule, and the meals and
 * workshops the badge scanner scans for. Saves to the current Event row; /guide reads it on the next load.
 * Organizer-only, like the rest of /admin.
 */
export default async function AdminEventPage() {
  await requireOrganizer();

  // Same "current event" as the rest of /admin: the most recent.
  const event = await prisma.event.findFirst({
    orderBy: { startDate: "desc" },
    select: {
      name: true,
      checkpoints: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, kind: true, _count: { select: { scans: true } } },
      },
      locations: true,
      parkingInfo: true,
      wifiInfo: true,
      whatToBring: true,
      codeOfConductUrl: true,
      hackerGuideUrl: true,
      discordUrl: true,
      contactEmail: true,
      schedule: true,
    },
  });

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[760px]">
        <Link href="/admin/applications" className="mb-6 inline-block text-[12px] text-text-muted hover:text-accent-pink">
          &larr; Applications
        </Link>
        <PixelCard className="p-6 md:p-8">
          <h1 className="mb-2 font-pixel text-lg leading-[1.6] text-text-primary">HACKER GUIDE</h1>
          <p className="mb-7 text-[13px] leading-[1.7] text-text-muted">
            {event
              ? `What accepted hackers see on /guide for ${event.name}. Saving updates it immediately, no deploy needed.`
              : "No event exists yet."}
          </p>
          {event && <GuideForm initial={event} />}
        </PixelCard>

        {event && (
          <PixelCard className="mt-8 p-6 md:p-8">
            <h2 className="mb-2 font-pixel text-lg leading-[1.6] text-text-primary">LOCATIONS</h2>
            <p className="mb-6 text-[13px] leading-[1.7] text-text-muted">
              Where things happen, shown on the guide&apos;s Venue &amp; Parking card. Saves separately.
            </p>
            <LocationsForm initial={parseLocations(event.locations)} />
          </PixelCard>
        )}

        {event && (
          <PixelCard className="mt-8 p-6 md:p-8">
            <h2 className="mb-2 font-pixel text-lg leading-[1.6] text-text-primary">SCHEDULE</h2>
            <p className="mb-6 text-[13px] leading-[1.7] text-text-muted">
              The run of show on /schedule. Saves separately from the guide above. If something slips on the day,
              announce it in Discord and fix the time here.
            </p>
            <ScheduleForm initial={parseSchedule(event.schedule)} />
          </PixelCard>
        )}

        {event && (
          <PixelCard className="mt-8 p-6 md:p-8">
            <h2 className="mb-2 font-pixel text-lg leading-[1.6] text-text-primary">MEALS &amp; WORKSHOPS</h2>
            <p className="mb-6 text-[13px] leading-[1.7] text-text-muted">
              What volunteers can scan badges for at /admin/check-in, besides check-in. Each hacker can be scanned once
              per item. Anything already scanned can be renamed but not deleted.
            </p>
            <Checkpoints
              rows={event.checkpoints.map((c) => ({ id: c.id, name: c.name, kind: c.kind, count: c._count.scans }))}
            />
          </PixelCard>
        )}
      </div>
    </div>
  );
}

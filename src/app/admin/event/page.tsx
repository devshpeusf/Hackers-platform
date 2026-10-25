import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import PixelCard from "@/components/ui/PixelCard";
import GuideForm from "./guide-form";

/**
 * Organizer editor for the hacker guide (venue, wifi, what to bring, code of
 * conduct). Saves to the current Event row; /guide reads it on the next load.
 * Organizer-only, like the rest of /admin.
 */
export default async function AdminEventPage() {
  await requireOrganizer();

  // Same "current event" as the rest of /admin: the most recent.
  const event = await prisma.event.findFirst({
    orderBy: { startDate: "desc" },
    select: {
      name: true,
      venueName: true,
      venueAddress: true,
      parkingInfo: true,
      wifiInfo: true,
      whatToBring: true,
      codeOfConductUrl: true,
      hackerGuideUrl: true,
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
      </div>
    </div>
  );
}

import { requireVolunteerOrAbove } from "@/lib/volunteer";
import { scannerOverview } from "@/lib/check-in";
import Scanner from "./scanner";

/**
 * The badge scanner (/admin/check-in): check-in at the door, then meals and
 * workshops. Volunteers and organizers. Built for a phone held at a table:
 * one column, big result, big buttons.
 */
export default async function CheckInPage() {
  await requireVolunteerOrAbove();
  const overview = await scannerOverview();

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-2 font-pixel text-lg leading-[1.7] text-text-primary">SCANNER</h1>
        {overview ? (
          <>
            <p className="mb-7 text-[13px] leading-[1.8] text-text-muted">
              {overview.eventName}: pick what you&apos;re scanning for, then scan each badge.
            </p>
            <Scanner initial={overview} />
          </>
        ) : (
          <p className="text-[13px] text-text-muted">There&apos;s no event set up yet.</p>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import PixelCard from "@/components/ui/PixelCard";
import { prisma } from "@/lib/prisma";
import { resolveRsvpToken } from "@/lib/rsvp";
import RsvpResponse, { RsvpUnavailable } from "./rsvp-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "RSVP",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** GET only reads. Scanners and previews must never record an attendance response. */
export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let details = null;
  try {
    const resolved = await resolveRsvpToken(token);
    if (resolved.status === "VALID") {
      details = await prisma.application.findUnique({
        where: { id: resolved.applicationId, status: "ACCEPTED" },
        select: { rsvpStatus: true, event: { select: { name: true } } },
      });
    }
  } catch {
    // A generic safe page also covers an unavailable database; no credentials
    // or applicant details belong in a browser error or application log.
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <PixelCard className="w-full max-w-xl space-y-6 p-6 sm:p-9">
        {details ? (
          <>
            <p className="font-pixel text-[10px] tracking-widest text-accent-teal">RSVP</p>
            <h1 className="break-words font-pixel text-base leading-8">{details.event.name}</h1>
            <RsvpResponse token={token} initialStatus={details.rsvpStatus} />
          </>
        ) : (
          <RsvpUnavailable />
        )}
      </PixelCard>
    </main>
  );
}

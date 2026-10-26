"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import TerminalWindow from "@/components/ui/TerminalWindow";
import StatusCard from "@/components/StatusCard";
import { formatEventDates } from "@/lib/status-card";
import type { ApplicationStatus, RsvpStatus } from "@/generated/prisma/client";
import { dashboardStatus } from "@/lib/placeholder-data";

type DashboardProps = {
  fullName: string;
  /** The signed-in hacker's own status, resolved server-side from their session. */
  status: ApplicationStatus;
  /** Their RSVP answer — without it a confirmed hacker would see "watch your email". */
  rsvpStatus: RsvpStatus;
  /** Name and dates, for the status card's wording. */
  event: {
    name: string;
    startDate: Date;
    endDate: Date;
    venueName: string | null;
    /** Help contacts from the Event row (same as the guide's "Need help?" box). */
    discordUrl: string | null;
    contactEmail: string | null;
  };
  diet: string;
  /** The hacker's own check-in QR, rendered server-side (src/lib/badge.ts). */
  badgeSvg: string | null;
};

export default function Dashboard({ fullName, status, rsvpStatus, event, diet, badgeSvg }: DashboardProps) {
  // The waiver checklist row is the one interactive bit of static state
  // on this page (mirrors the mockup's toggle) — no persistence.
  const [waiverDone, setWaiverDone] = useState(false);

  return (
    <div>
      <div className="mb-9 flex flex-col-reverse items-start justify-between gap-6 sm:flex-row">
        <div>
          <div className="mb-4 card-text text-text-secondary">Hi, {fullName}!</div>
          <div className="flex flex-col items-start gap-3.5">
            <h1 className="max-w-xl font-pixel text-2xl leading-[1.7] text-text-primary">
              YOU&apos;RE ACCEPTED
              <br />
              TO HACKJAM &apos;26
            </h1>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 bg-accent-teal opacity-50" />
              <span className="h-1.5 w-1.5 bg-accent-teal" />
              <span className="h-1 w-1 bg-accent-teal opacity-50" />
            </div>
          </div>
          <div className="mt-4 max-w-lg card-text text-text-muted">
            Finish the steps below before check-in.{" "}
            {formatEventDates(new Date(event.startDate), new Date(event.endDate))}
            {event.venueName ? ` at ${event.venueName}` : ""}.
          </div>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end">
          <PixelChip color="var(--color-accent-pink)">{dashboardStatus.eventName}</PixelChip>
          <Image
            src="/hackjam-mascot.png"
            alt=""
            width={100}
            height={127}
            className="h-auto w-[100px] [image-rendering:pixelated]"
          />
        </div>
      </div>

      <div className="flex flex-col items-start gap-7 lg:flex-row">
        <div className="flex w-full flex-col gap-6 lg:w-[480px] lg:shrink-0">
          {/* The real status (PLAT-45). The old placeholder ticked off
              "Confirm attendance" for everyone, which nobody had done. The
              waiver row is still local-only state until waivers are real. */}
          <StatusCard status={status} rsvpStatus={rsvpStatus} event={event}>
            <button
              type="button"
              onClick={() => setWaiverDone((v) => !v)}
              className="nav-row flex items-center justify-between gap-2.5 p-0.5 text-left"
            >
              <div className="flex items-center gap-2.5 card-meta text-text-primary">
                <span className={waiverDone ? "text-accent-teal" : "text-accent-amber"}>
                  {waiverDone ? "[x]" : "[ ]"}
                </span>
                <span className={waiverDone ? "line-through" : ""}>Complete liability waiver</span>
              </div>
              <span className="text-[12px] font-bold text-accent-amber">{waiverDone ? "DONE" : "RUN >"}</span>
            </button>
          </StatusCard>

          <PixelCard borderColor="var(--color-accent-purple)" className="flex flex-col items-center card-pad">
            <span className="self-start card-title text-accent-purple-light">
              // DIGITAL PASS
            </span>
            <div className="my-4.5 card-value">{fullName.toUpperCase()}</div>
            {badgeSvg ? (
              <>
                {/* White plate behind the code: scanners need dark-on-light, and
                    the SVG's own white quiet zone needs to read as part of it. */}
                <div className="w-full max-w-[260px] overflow-hidden rounded-2xl bg-white shadow-[0_0_0_4px_rgba(197,139,255,0.18),0_0_32px_rgba(197,139,255,0.28)]">
                  <div
                    role="img"
                    aria-label="Your check-in QR code"
                    className="p-1 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: badgeSvg }}
                  />
                  <div className="flex items-center justify-between border-t border-dashed border-[#120f1f]/20 px-4 py-2 font-pixel text-[7px] tracking-widest text-[#120f1f]/60">
                    <span>ADMIT ONE</span>
                    <span>HACKJAM &apos;26</span>
                  </div>
                </div>
                <div className="mt-4 text-center card-meta text-text-muted">
                  Show this at check-in. Turn your screen brightness up if it won&apos;t scan.
                  <br />
                  It&apos;s yours only, so don&apos;t share it.
                </div>
              </>
            ) : (
              <p role="status" className="text-center card-text text-accent-amber">
                Your badge is unavailable. Please contact an organizer before check-in.
              </p>
            )}
          </PixelCard>
        </div>

        <div className="flex w-full flex-1 flex-col gap-6">
          <div className="flex flex-col gap-6 sm:flex-row">
            <PixelCard className="flex-1 px-6 py-5.5">
              <span className="card-label text-text-muted">MEAL PREF</span>
              <div className="mt-3 card-text font-bold">{diet.toUpperCase()}</div>
            </PixelCard>
            <Link href="/team" className="flex-1">
              <PixelCard clickable className="px-6 py-5.5">
                <span className="card-label text-text-muted">TEAM</span>
                <div className="mt-3 card-text font-bold">
                  NOT FORMED · <span className="text-accent-teal">FIND TEAMMATES</span>
                </div>
              </PixelCard>
            </Link>
          </div>

          <Link href="/guide">
            <PixelCard borderColor="var(--color-accent-magenta)" clickable className="flex items-center justify-between px-6.5 py-6">
              <div className="flex items-center gap-3.5">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-accent-magenta)"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
                  <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5v-13Z" />
                </svg>
                <div>
                  <div className="card-text font-bold">HACKER GUIDE</div>
                  <div className="mt-1 card-meta text-text-muted">Venue map, wifi, schedule, and what to bring.</div>
                </div>
              </div>
              <span className="text-base text-text-dim">&gt;</span>
            </PixelCard>
          </Link>

          <TerminalWindow filename="CONTACT.LOG">
            <div className="px-6.5 pt-3 pb-5">
              {/* Real contacts from the Event row; a row hides until it's set. */}
              {[
                event.discordUrl && {
                  command: "discord --join",
                  target: "HackJam Discord",
                  action: "JOIN",
                  href: event.discordUrl,
                  external: true,
                },
                event.contactEmail && {
                  command: "mail --to",
                  target: event.contactEmail,
                  action: "EMAIL",
                  href: `mailto:${event.contactEmail}`,
                  external: false,
                },
              ]
                .filter((entry) => !!entry)
                .map((entry, i, all) => (
                  <a
                    key={entry.command}
                    href={entry.href}
                    {...(entry.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={
                      "group flex items-center justify-between gap-4 py-3.5" +
                      (i < all.length - 1 ? " border-b border-text-primary/8" : "")
                    }
                  >
                    <div className="card-meta min-w-0 break-all">
                      <span className="text-accent-teal">$</span> {entry.command}{" "}
                      <span className="text-text-dim group-hover:text-text-secondary">{entry.target}</span>
                    </div>
                    <span className="shrink-0 text-[12px] text-accent-teal group-hover:underline">{entry.action}</span>
                  </a>
                ))}
            </div>
          </TerminalWindow>
        </div>
      </div>
    </div>
  );
}

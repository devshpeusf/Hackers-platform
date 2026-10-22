"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import TerminalWindow from "@/components/ui/TerminalWindow";
import StatusCard from "@/components/StatusCard";
import type { ApplicationStatus } from "@/generated/prisma/client";
import { dashboardStatus, contactLog } from "@/lib/placeholder-data";

type DashboardProps = {
  fullName: string;
  /** The signed-in hacker's own status, resolved server-side from their session. */
  status: ApplicationStatus;
  diet: string;
  /** The hacker's own check-in QR, rendered server-side (src/lib/badge.ts). */
  badgeSvg: string;
};

export default function Dashboard({ fullName, status, diet, badgeSvg }: DashboardProps) {
  // The waiver checklist row is the one interactive bit of static state
  // on this page (mirrors the mockup's toggle) — no persistence.
  const [waiverDone, setWaiverDone] = useState(false);

  return (
    <div>
      <div className="mb-9 flex flex-col-reverse items-start justify-between gap-6 sm:flex-row">
        <div>
          <div className="mb-4 text-[13px] text-text-secondary">Hi, {fullName}!</div>
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
          <div className="mt-4 max-w-md text-[13px] leading-[1.7] text-text-muted">
            Finish the steps below before check-in. {dashboardStatus.dateVenue}.
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
        <div className="flex w-full flex-col gap-6 lg:w-[440px] lg:shrink-0">
          {/* The real status (PLAT-45). The old placeholder ticked off
              "Confirm attendance" for everyone, which nobody had done. The
              waiver row is still local-only state until waivers are real. */}
          <StatusCard status={status}>
            <button
              type="button"
              onClick={() => setWaiverDone((v) => !v)}
              className="nav-row flex items-center justify-between gap-2.5 p-0.5 text-left"
            >
              <div className="flex items-center gap-2.5 text-xs text-text-primary">
                <span className={waiverDone ? "text-accent-teal" : "text-accent-amber"}>
                  {waiverDone ? "[x]" : "[ ]"}
                </span>
                <span className={waiverDone ? "line-through" : ""}>Complete liability waiver</span>
              </div>
              <span className="text-[11px] font-bold text-accent-amber">{waiverDone ? "DONE" : "RUN >"}</span>
            </button>
          </StatusCard>

          <PixelCard borderColor="var(--color-accent-purple)" className="flex flex-col items-center p-7.5">
            <span className="self-start font-pixel text-[9px] tracking-widest text-accent-purple-light">
              // DIGITAL PASS
            </span>
            <div className="my-4.5 text-base font-bold">{fullName.toUpperCase()}</div>
            {/* White plate behind the code: scanners need dark-on-light, and
                the SVG's own white quiet zone needs to read as part of it. */}
            <div className="w-full max-w-[240px] overflow-hidden rounded-2xl bg-white shadow-[0_0_0_4px_rgba(197,139,255,0.18),0_0_32px_rgba(197,139,255,0.28)]">
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
            <div className="mt-4 text-center text-[11px] leading-[1.7] text-text-muted">
              Show this at check-in. Turn your screen brightness up if it won&apos;t scan.
              <br />
              It&apos;s yours only, so don&apos;t share it.
            </div>
          </PixelCard>
        </div>

        <div className="flex w-full flex-1 flex-col gap-6">
          <div className="flex flex-col gap-6 sm:flex-row">
            <PixelCard className="flex-1 px-5 py-4.5">
              <span className="font-pixel text-[8px] tracking-wide text-text-muted">MEAL PREF</span>
              <div className="mt-2.5 text-[13px] font-bold">{diet.toUpperCase()}</div>
            </PixelCard>
            <Link href="/team" className="flex-1">
              <PixelCard clickable className="px-5 py-4.5">
                <span className="font-pixel text-[8px] tracking-wide text-text-muted">TEAM</span>
                <div className="mt-2.5 text-[13px] font-bold">
                  NOT FORMED · <span className="text-accent-teal">FIND TEAMMATES</span>
                </div>
              </PixelCard>
            </Link>
          </div>

          <Link href="/guide">
            <PixelCard borderColor="var(--color-accent-magenta)" clickable className="flex items-center justify-between px-5.5 py-5">
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
                  <div className="text-[13px] font-bold">HACKER GUIDE</div>
                  <div className="mt-1 text-[11px] text-text-muted">Venue map, wifi, schedule, and what to bring.</div>
                </div>
              </div>
              <span className="text-base text-text-dim">&gt;</span>
            </PixelCard>
          </Link>

          <TerminalWindow filename="CONTACT.LOG">
            <div className="px-5.5 pt-2 pb-4.5">
              {contactLog.map((entry, i) => (
                <div
                  key={entry.command}
                  className={
                    "flex items-center justify-between py-3.5" +
                    (i < contactLog.length - 1 ? " border-b border-text-primary/8" : "")
                  }
                >
                  <div className="text-xs">
                    <span className="text-accent-teal">$</span> {entry.command}{" "}
                    <span className="text-text-dim">{entry.target}</span>
                  </div>
                  <span className="text-[11px] text-accent-teal">{entry.action}</span>
                </div>
              ))}
            </div>
          </TerminalWindow>
        </div>
      </div>
    </div>
  );
}

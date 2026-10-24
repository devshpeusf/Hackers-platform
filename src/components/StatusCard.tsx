import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { ApplicationStatus, RsvpStatus } from "@/generated/prisma/client";
import PixelCard from "@/components/ui/PixelCard";
import { formatEventDates, getStatusCardContent } from "@/lib/status-card";
import RsvpButtons from "@/components/RsvpButtons";

/**
 * The applicant's real status (PLAT-45), on the portal dashboard and on
 * /apply/status.
 *
 * Takes a status, never an id: callers pass the status of the application
 * they already resolved from the signed-in session (getCurrentHacker /
 * the verified Discord id), so this can only ever show the viewer's own state.
 *
 * No hooks and no server-only imports, so it renders inside the dashboard's
 * client component as well as in Server Components.
 *
 * `children` is for page-specific rows under the status — the dashboard puts
 * its waiver checklist row there.
 *
 * `event` is optional and only used for wording ("HackJam '26 · Nov 7–8").
 */
export default function StatusCard({
  status,
  rsvpStatus,
  event,
  children,
  className,
}: {
  status: ApplicationStatus | null;
  rsvpStatus?: RsvpStatus;
  event?: { name: string; startDate: Date; endDate: Date };
  children?: ReactNode;
  className?: string;
}) {
  const content = getStatusCardContent(status, rsvpStatus);
  const dates = event ? formatEventDates(new Date(event.startDate), new Date(event.endDate)) : null;
  const confirmed = status === "ACCEPTED" && rsvpStatus === "CONFIRMED";

  return (
    <PixelCard borderColor={content.color} className={className ?? "p-6.5"}>
      <span className="font-pixel text-[9px] tracking-widest" style={{ color: content.color }}>
        // STATUS
      </span>
      <div
        className="my-3.5 text-base font-bold [text-shadow:0_0_14px_var(--glow)]"
        style={{ color: content.color, "--glow": `color-mix(in srgb, ${content.color} 40%, transparent)` } as CSSProperties}
      >
        {content.headline}
      </div>
      <p className="text-[13px] leading-[1.8] text-text-secondary">{content.body}</p>

      {content.action && (
        <Link
          href={content.action.href}
          className="pixel-btn-solid mt-5 inline-flex px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg"
        >
          {content.action.label} &rarr;
        </Link>
      )}

      {/* The buttons carry no id — the action resolves whose RSVP this is
          from the session (src/app/rsvp/signed-in-actions.ts). */}
      {content.rsvp && <RsvpButtons eventLabel={event && dates ? `${event.name} · ${dates}` : undefined} />}

      {/* The payoff for confirming: the one moment worth marking. */}
      {confirmed && dates && (
        <div className="mt-5 border border-text-primary/8 border-l-[3px] border-l-accent-teal bg-accent-teal/5 px-4 py-3.5">
          <div className="font-pixel text-[9px] tracking-widest text-accent-teal">SEE YOU THERE</div>
          <div className="mt-2 text-[13px] font-bold text-text-primary">
            {event!.name} · {dates}
          </div>
        </div>
      )}

      {children && <div className="mt-5 flex flex-col gap-3 border-t border-text-primary/8 pt-4">{children}</div>}
    </PixelCard>
  );
}

"use client";

import { useActionState, useState } from "react";
import { respondToRsvpSignedIn } from "@/app/rsvp/signed-in-actions";

/**
 * "Will you be there?" on the status card, for an accepted hacker who hasn't
 * answered yet. Same rules as the emailed RSVP link (src/lib/rsvp.ts): the
 * first answer is final.
 *
 * Boxed with a pink edge like the acceptance email's STEP 1 callout, so it
 * reads as the thing to do rather than more information. Decline asks first:
 * it's final and takes them out of the portal.
 */
export default function RsvpButtons({ eventLabel }: { eventLabel?: string }) {
  const [state, action, pending] = useActionState(respondToRsvpSignedIn, { status: "PENDING" as const });
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  // Normally the page re-renders into the confirmed / declined card right
  // away; this covers the moment in between.
  if (state.status === "CONFIRMED" || state.status === "DECLINED") {
    return (
      <p role="status" className="mt-5 card-meta text-text-muted">
        {state.status === "CONFIRMED" ? "You're confirmed. See you there!" : "You've declined."}
      </p>
    );
  }

  return (
    <form
      action={action}
      className="mt-5 border border-text-primary/8 border-l-[3px] border-l-accent-pink bg-accent-pink/5 px-4 py-4"
    >
      {confirmingDecline ? (
        <>
          <div className="card-label text-text-muted">CAN&apos;T MAKE IT?</div>
          <p className="mt-2.5 card-meta text-text-secondary">
            No worries. Declining frees your spot for someone on the waitlist. It can&apos;t be undone, and
            you&apos;ll lose access to the hacker portal.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              name="choice"
              value="DECLINED"
              disabled={pending}
              className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[11px] font-bold tracking-wide text-terminal-red disabled:opacity-50"
            >
              YES, DECLINE
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDecline(false)}
              disabled={pending}
              className="px-1 text-[11px] font-bold text-accent-teal underline-offset-4 hover:underline"
            >
              Keep my spot
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="card-label text-accent-pink">WILL YOU BE THERE?</div>
          {eventLabel && <div className="mt-2 card-meta text-text-secondary">{eventLabel}</div>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              name="choice"
              value="CONFIRMED"
              disabled={pending}
              className="pixel-btn-solid px-[18px] py-[10px] font-body text-[11px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
            >
              &#10003; I&apos;M COMING
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDecline(true)}
              disabled={pending}
              className="pixel-btn-outline bg-surface-bg px-[18px] py-[10px] font-body text-[11px] font-bold tracking-wide text-text-primary disabled:opacity-50"
            >
              &#10005; CAN&apos;T MAKE IT
            </button>
          </div>
          <p className="mt-3.5 text-[12px] leading-[1.6] text-text-faintest">
            RSVP closes when the event starts. Confirm early so we can plan food and swag.
          </p>
        </>
      )}

      <p
        role={state.status === "ERROR" || state.status === "UNAVAILABLE" ? "alert" : "status"}
        aria-live="polite"
        className="mt-3 card-meta text-text-muted empty:hidden"
      >
        {pending
          ? "Saving…"
          : state.status === "ERROR"
            ? "We couldn't save that. Please try again."
            : state.status === "UNAVAILABLE"
              ? "RSVP isn't available for this application anymore. Contact the event organizers."
              : ""}
      </p>
    </form>
  );
}

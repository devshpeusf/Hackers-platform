"use client";

import { useActionState, useState } from "react";
import { respondToRsvpSignedIn } from "@/app/rsvp/signed-in-actions";

/**
 * Confirm / decline on the status card, for an accepted hacker who hasn't
 * answered yet. Same rules as the emailed RSVP link (src/lib/rsvp.ts): the
 * first answer is final.
 *
 * Decline asks first. It's final and takes them out of the portal, so it
 * shouldn't happen from one stray tap on the dashboard. Confirm is one click,
 * the same as the link page.
 */
export default function RsvpButtons() {
  const [state, action, pending] = useActionState(respondToRsvpSignedIn, { status: "PENDING" as const });
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  if (state.status === "CONFIRMED" || state.status === "DECLINED") {
    return (
      <p role="status" className="mt-4 text-[12px] leading-[1.7] text-text-muted">
        {state.status === "CONFIRMED" ? "You're confirmed. See you there!" : "You've declined."} To change it,
        contact the event organizers.
      </p>
    );
  }

  return (
    <form action={action} className="mt-5">
      {confirmingDecline ? (
        <div className="border-l-[3px] border-terminal-red bg-terminal-red/6 px-3.5 py-3">
          <p className="mb-3 text-[12px] leading-[1.7] text-text-secondary">
            Decline your spot? This is final, and you&apos;ll lose access to the hacker portal.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="submit"
              name="choice"
              value="DECLINED"
              disabled={pending}
              className="pixel-btn-outline bg-surface-bg px-4 py-2 font-body text-[11px] font-bold tracking-wide text-terminal-red disabled:opacity-50"
            >
              YES, DECLINE
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDecline(false)}
              disabled={pending}
              className="px-2 text-[11px] text-text-muted hover:text-text-primary"
            >
              Keep my spot
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            name="choice"
            value="CONFIRMED"
            disabled={pending}
            className="pixel-btn-solid px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
          >
            CONFIRM I&apos;M COMING &rarr;
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDecline(true)}
            disabled={pending}
            className="text-[11px] text-text-muted underline-offset-4 hover:text-text-primary hover:underline"
          >
            I can&apos;t make it
          </button>
        </div>
      )}

      <p role={state.status === "ERROR" || state.status === "UNAVAILABLE" ? "alert" : "status"} aria-live="polite" className="mt-3 text-[11px] leading-[1.7] text-text-muted empty:hidden">
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

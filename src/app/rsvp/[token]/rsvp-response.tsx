"use client";

import { useActionState } from "react";
import { respondToRsvp } from "./actions";

export function RsvpUnavailable() {
  return (
    <div role="status" className="space-y-4 text-sm leading-7 text-text-secondary">
      <h1 className="font-pixel text-base leading-8 text-text-primary">RSVP link unavailable</h1>
      <p>This link cannot be used. Please contact the event organizers for help.</p>
    </div>
  );
}

export default function RsvpResponse({
  token,
  initialStatus,
}: {
  token: string;
  initialStatus: "PENDING" | "CONFIRMED" | "DECLINED";
}) {
  const [state, formAction, pending] = useActionState(respondToRsvp, { status: initialStatus });

  if (state.status === "UNAVAILABLE") return <RsvpUnavailable />;
  if (state.status === "CONFIRMED" || state.status === "DECLINED") {
    return (
      <div role="status" className="space-y-4 text-sm leading-7 text-text-secondary">
        <p className="font-bold text-text-primary">
          {state.status === "CONFIRMED" ? "Your attendance is confirmed." : "You have declined attendance."}
        </p>
        <p>Your response has been recorded. To request a change, contact the event organizers.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm leading-7 text-text-secondary">
        Will you be joining us? Your first response is final. Contact the event organizers if you need
        to change it later.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          type="submit"
          name="choice"
          value="CONFIRMED"
          disabled={pending}
          className="pixel-btn-solid px-5 py-3 text-sm font-bold text-surface-bg disabled:opacity-50"
        >
          Confirm attendance
        </button>
        <button
          type="submit"
          name="choice"
          value="DECLINED"
          disabled={pending}
          className="pixel-btn-outline bg-surface-bg px-5 py-3 text-sm font-bold text-text-primary disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      <p
        role={state.status === "ERROR" || state.status === "INVALID_CHOICE" ? "alert" : "status"}
        className="text-sm leading-7 text-text-secondary"
        aria-live="polite"
      >
        {pending
          ? "Saving your response..."
          : state.status === "ERROR"
            ? "We could not save your response. Please try again."
            : state.status === "INVALID_CHOICE"
              ? "Please choose Confirm attendance or Decline."
              : ""}
      </p>
    </form>
  );
}

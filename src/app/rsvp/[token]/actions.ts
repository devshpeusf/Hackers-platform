"use server";

import { recordRsvpResponse, type RsvpResponseResult } from "@/lib/rsvp";

export type RsvpActionState = RsvpResponseResult | { status: "PENDING" | "ERROR" };

/** Previous UI state and any extra form fields are never authorization. */
export async function respondToRsvp(
  _previousState: RsvpActionState,
  formData: FormData,
): Promise<RsvpActionState> {
  try {
    return await recordRsvpResponse(formData.get("token"), formData.get("choice"));
  } catch {
    // Do not send database errors (or log bearer credentials) to the browser.
    return { status: "ERROR" };
  }
}

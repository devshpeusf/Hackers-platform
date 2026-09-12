import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { getOpenEvent } from "@/lib/events";
import ApplicationWizard from "./wizard";

/**
 * Server shell for the wizard: reads the Discord session and hands the
 * applicant's identity down as a prop, so the client bundle never has to
 * fetch it and the form renders already knowing who's filling it in.
 *
 * The middleware also gates this route. Checking again here is deliberate —
 * middleware runs on the edge and can be bypassed by config mistakes, and a
 * page that reads a session should not assume one exists.
 *
 * Also fetches the open event just for its start date — the 18+ age check
 * (PLAT-19) is judged against the event, not against today, so the wizard
 * needs it before it can validate step 2 at all. If there's no open event,
 * submission already fails with the "closed" screen either way; falling
 * back to "now" here just keeps the client-side check from crashing on a
 * missing date in that edge case, it doesn't newly handle "closed" itself.
 */
export default async function ApplyFormPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/apply?signin=required");

  const event = await getOpenEvent();

  return (
    <ApplicationWizard
      identity={toApplicantIdentity(user)}
      eventStartDate={event?.startDate ?? new Date()}
    />
  );
}

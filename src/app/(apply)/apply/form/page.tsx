import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { hasApplied } from "@/lib/applications";
import { getOpenEvent } from "@/lib/events";
import ApplicationWizard from "./wizard";

/**
 * Server shell for the wizard: reads the Discord session and hands the
 * applicant's identity down as a prop, so the client bundle never has to
 * fetch it and the form renders already knowing who's filling it in.
 *
 * Redirects anyone who has already applied to /apply/applied — the form is for
 * people who still need to fill it in.
 *
 * The middleware also gates this route. Checking again here is deliberate —
 * middleware runs on the edge and can be bypassed by config mistakes, and a
 * page that reads a session should not assume one exists.
 */
export default async function ApplyFormPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/apply?signin=required");

  const identity = toApplicantIdentity(user);

  // Someone who has already applied *to the event currently open* gets sent
  // straight to their application. Without this they'd be handed a blank
  // five-step form and only discover at SUBMIT that it was never needed —
  // the unique constraint would reject it.
  //
  // If nothing is currently open there's nothing to have applied to yet —
  // fall through to the wizard rather than block on a past event's
  // application. The wizard's own submit path already handles "applications
  // closed" as its own screen.
  const event = await getOpenEvent();
  if (event && (await hasApplied(identity.discordId, event.id))) {
    redirect("/apply/applied");
  }

  return <ApplicationWizard identity={identity} />;
}

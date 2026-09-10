import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import ApplicationWizard from "./wizard";

/**
 * Server shell for the wizard: reads the Discord session and hands the
 * applicant's identity down as a prop, so the client bundle never has to
 * fetch it and the form renders already knowing who's filling it in.
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

  return <ApplicationWizard identity={toApplicantIdentity(user)} />;
}

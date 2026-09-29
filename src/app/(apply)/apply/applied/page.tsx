import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { getApplication } from "@/lib/applications";
import SubmittedScreen from "../../_submitted-screen";

/**
 * Where an applicant lands after signing in again.
 *
 * Shows the same "you're in the pile" screen they saw when they submitted —
 * the fact hasn't changed, so neither should the screen. Previously this was
 * a separate "ONE PER HACKER" page, which told them the same thing in a
 * different voice depending on how they got here.
 *
 * Anyone who hasn't applied goes to the form, so the URL can't be used to
 * skip it.
 */
export default async function AlreadyAppliedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/apply?signin=required");

  const identity = toApplicantIdentity(user);
  const application = await getApplication(identity.discordId);
  if (!application) redirect("/apply/form");

  // The address they gave on the form, not their Discord one — that's where
  // decisions actually go.
  return <SubmittedScreen email={application.person.email} />;
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { hasApplied } from "@/lib/applications";
import AlreadyApplied from "../../_already-applied";

/**
 * Where a returning applicant lands after signing in.
 *
 * Exists so signing in again doesn't drop someone straight into a wall of
 * their own answers — this says plainly that they're done, and offers the two
 * things they might actually want: see what they submitted, or go and do the
 * MLH registration they still owe.
 *
 * Anyone who hasn't applied is sent to the form instead, so the URL can't be
 * used to skip it.
 */
export default async function AlreadyAppliedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/apply?signin=required");

  const identity = toApplicantIdentity(user);
  if (!(await hasApplied(identity.discordId))) redirect("/apply/form");

  return <AlreadyApplied username={identity.username} />;
}

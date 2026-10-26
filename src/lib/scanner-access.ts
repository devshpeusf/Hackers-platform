import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { isVolunteerOrAbove } from "@/lib/volunteer";

type ScannerAccess = "ALLOWED" | "UNAUTHENTICATED" | "FORBIDDEN" | "UNAVAILABLE";

/** Fresh session and DB role on every call; no application or client-supplied identity. */
export async function getScannerAccess(): Promise<ScannerAccess> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return "UNAUTHENTICATED";

    const { discordId } = toApplicantIdentity(user);
    return await isVolunteerOrAbove(discordId) ? "ALLOWED" : "FORBIDDEN";
  } catch {
    // Never expose credential-bearing Auth/Prisma exceptions, including to logs.
    return "UNAVAILABLE";
  }
}

/** Page wrapper. Route handlers must independently call getScannerAccess(). */
export async function requireVolunteerOrAbove(): Promise<void> {
  const access = await getScannerAccess();
  if (access === "UNAUTHENTICATED") redirect("/auth/signin?next=/scanner");
  if (access === "UNAVAILABLE") throw new Error("Scanner unavailable. Please try again.");
  if (access !== "ALLOWED") notFound();
}

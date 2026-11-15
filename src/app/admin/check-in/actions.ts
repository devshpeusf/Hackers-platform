"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { isVolunteerOrAbove } from "@/lib/volunteer";
import { scan, searchHackers, scannerOverview, type HackerMatch, type ScanResult } from "@/lib/check-in";

/**
 * The scanner's calls (/admin/check-in). Volunteer-or-above, re-checked on
 * every call: a Server Action is a public endpoint whatever gates the page.
 */

/** The scanning staff member's Person id, or null if they aren't staff. */
async function currentStaffId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { discordId } = toApplicantIdentity(user);
  if (!discordId || !(await isVolunteerOrAbove(discordId))) return null;

  const person = await prisma.person.findUnique({ where: { discordId }, select: { id: true } });
  return person?.id ?? null;
}

const DENIED: ScanResult = { outcome: "error", message: "You're signed out, or not on staff. Reload the page." };

/** A badge read by the camera (or typed): `badge` is the QR's text. */
export async function scanBadgeAction(mode: string, badge: string): Promise<ScanResult> {
  const staffId = await currentStaffId();
  if (!staffId) return DENIED;
  if (typeof mode !== "string" || typeof badge !== "string") return { outcome: "error", message: "Bad request." };
  try {
    return await scan({ mode, badge: badge.slice(0, 200), staffId });
  } catch (e) {
    console.error("[check-in] scan failed:", e instanceof Error ? e.message : String(e));
    return { outcome: "error", message: "Couldn't save that scan. Check the connection and scan again." };
  }
}

/** Someone picked from name search instead of scanning. */
export async function scanApplicationAction(mode: string, applicationId: string): Promise<ScanResult> {
  const staffId = await currentStaffId();
  if (!staffId) return DENIED;
  if (typeof mode !== "string" || typeof applicationId !== "string") return { outcome: "error", message: "Bad request." };
  try {
    return await scan({ mode, applicationId, staffId });
  } catch (e) {
    console.error("[check-in] scan failed:", e instanceof Error ? e.message : String(e));
    return { outcome: "error", message: "Couldn't save that. Check the connection and try again." };
  }
}

export async function searchHackersAction(query: string): Promise<HackerMatch[]> {
  if (!(await currentStaffId()) || typeof query !== "string") return [];
  return searchHackers(query.slice(0, 80));
}

/** Fresh counts after each scan. */
export async function overviewAction() {
  if (!(await currentStaffId())) return null;
  return scannerOverview();
}

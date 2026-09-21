import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";

/**
 * POST-only: a GET sign-out can be triggered by a prefetch or an <img> tag,
 * which would log people out unexpectedly.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/apply", getSiteOrigin(request)), {
    status: 303,
  });
}

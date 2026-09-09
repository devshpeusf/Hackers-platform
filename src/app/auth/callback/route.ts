import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Discord sends the applicant back. Trades the one-time code for a
 * session, which the client writes as cookies, then drops them into the form.
 *
 * This URL must be registered as a redirect in BOTH the Discord application
 * and the Supabase dashboard, for every origin used (localhost and the
 * deployed domain).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/apply/form";

  // Discord sends the user back here with ?error= if they hit Cancel.
  const denied = searchParams.get("error");
  if (denied) {
    const url = new URL("/apply", origin);
    url.searchParams.set("error", denied);
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));

    const url = new URL("/apply", origin);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL("/apply?error=missing_code", origin));
}

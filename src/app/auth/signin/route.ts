import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts Discord OAuth.
 *
 * A GET route rather than a client-side handler on purpose: it keeps the
 * sign-in button on /apply a plain <Link> in a Server Component, so it works
 * before any JavaScript loads. Supabase's signInWithOAuth on the server
 * returns the provider URL instead of navigating, and we redirect to it.
 *
 * Requires the Discord provider to be enabled in the Supabase dashboard with
 * the app's client ID and secret — until then this returns provider_disabled.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { origin } = new URL(request.url);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/auth/callback`,
      // Matches what Knight Hacks request: enough to identify the applicant
      // and add them to the server later. Discord does NOT return a usable
      // email even with the email scope, which is why the form asks for one.
      scopes: "identify guilds.join",
    },
  });

  if (error || !data.url) {
    const url = new URL("/apply", origin);
    url.searchParams.set("error", error?.message ?? "no_provider_url");
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(data.url);
}

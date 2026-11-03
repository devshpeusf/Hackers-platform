import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { isBackgroundRequest } from "@/lib/signin-guard";

/**
 * Starts Discord OAuth.
 *
 * A GET route rather than a client-side handler on purpose: the sign-in
 * button on /apply is a plain <a> in a Server Component, so it works before
 * any JavaScript loads. Supabase's signInWithOAuth on the server returns the
 * provider URL instead of navigating, and we redirect to it.
 *
 * Every call writes a fresh one-time secret (the PKCE code verifier) into a
 * cookie, replacing the last one. So this route must run once per click and
 * never for a prefetch: a background request landing after the real one
 * swaps the secret, and the callback can't finish sign-in. That's why the
 * button is a plain <a> and not a Next <Link> (which prefetches), and why
 * background requests are turned away below without touching cookies.
 *
 * Requires the Discord provider to be enabled in the Supabase dashboard with
 * the app's client ID and secret — until then this returns provider_disabled.
 */
export async function GET(request: NextRequest) {
  if (isBackgroundRequest(request.headers)) {
    // No body and no cookies. If a Next.js client navigation lands here, it
    // falls back to a normal page load, which then runs this route for real.
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createClient();
  const origin = getSiteOrigin(request);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/auth/callback`,
      // Matches what Knight Hacks request: enough to identify the applicant
      // and add them to the server later. Discord does NOT return a usable
      // email even with the email scope, which is why the form asks for one.
      scopes: "guilds.join",
    },
  });

  if (error || !data.url) {
    console.warn("[auth] signin could not start:", error?.message ?? "no_provider_url");
    const url = new URL("/apply", origin);
    url.searchParams.set("error", error?.message ?? "no_provider_url");
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { RETRY_COOKIE, browserKind, classifyProviderError, hasCodeVerifier } from "@/lib/signin-guard";
import { recordSignInFailure } from "@/lib/signin-failures";

/**
 * Where Discord sends the applicant back. Trades the one-time code for a
 * session, which the client writes as cookies, then drops them into the form.
 *
 * This URL must be registered as a redirect in BOTH the Discord application
 * and the Supabase dashboard, for every origin used (localhost and the
 * deployed domain).
 *
 * Every failure is recorded (SignInFailure, see /admin/sign-in-issues) and
 * sends them to /apply with a reason, which picks the message they see.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getSiteOrigin(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const browser = browserKind(request.headers.get("user-agent"));
  const verifier = hasCodeVerifier(request.cookies.getAll().map((c) => c.name));

  // Supabase sends them back with ?error= when Discord or Supabase refused:
  // they hit Cancel, or their Discord email isn't verified, or it has none.
  const denied = searchParams.get("error");
  if (denied) {
    const errorCode = searchParams.get("error_code");
    const description = searchParams.get("error_description");
    const reason = classifyProviderError(denied, errorCode, description);
    await recordSignInFailure({ reason, code: errorCode ?? denied, description, browser, verifier });
    return toApply(origin, reason);
  }

  if (!code) {
    await recordSignInFailure({ reason: "missing_code", browser, verifier });
    return toApply(origin, "failed");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return signedIn(origin, next);

  // The code works once. If this page loaded twice (a double redirect, the
  // back button, a refresh) the first load already signed them in and this
  // one fails — so check for a session before calling it a failure.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return signedIn(origin, next);

  // No secret cookie: usually the Discord app sent them back in a different
  // browser from the one they started in. Starting again from here keeps the
  // whole round trip in this browser, so it normally works. Once only: the
  // cookie below makes a second failure show the message instead of looping.
  if (!verifier && !request.cookies.has(RETRY_COOKIE)) {
    await recordSignInFailure({ reason: "missing_verifier", code: error.code, description: error.message, browser, verifier, retried: true });
    const response = NextResponse.redirect(new URL("/auth/signin?retry=1", origin));
    response.cookies.set(RETRY_COOKIE, "1", { maxAge: 600, httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: "/" });
    return response;
  }

  await recordSignInFailure({
    reason: verifier ? "failed" : "missing_verifier",
    code: error.code,
    description: error.message,
    browser,
    verifier,
  });
  return toApply(origin, "failed");
}

function signedIn(origin: string, next: string) {
  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.delete(RETRY_COOKIE);
  return response;
}

function toApply(origin: string, error: string) {
  const url = new URL("/apply", origin);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

/** Only same-site paths, so ?next= can't send someone to another domain. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/apply/form";
}

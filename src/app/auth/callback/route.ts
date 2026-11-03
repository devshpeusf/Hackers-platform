import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { browserKind, hasCodeVerifier } from "@/lib/signin-guard";

/**
 * Where Discord sends the applicant back. Trades the one-time code for a
 * session, which the client writes as cookies, then drops them into the form.
 *
 * This URL must be registered as a redirect in BOTH the Discord application
 * and the Supabase dashboard, for every origin used (localhost and the
 * deployed domain).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getSiteOrigin(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Discord sends the user back here with ?error= if they hit Cancel.
  const denied = searchParams.get("error");
  if (denied) {
    logFailure(request, denied);
    return toApply(origin, denied);
  }

  if (!code) {
    logFailure(request, "missing_code");
    return toApply(origin, "missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return NextResponse.redirect(new URL(next, origin));

  // The code works once. If this page loaded twice (a double redirect, the
  // back button, a refresh) the first load already signed them in and this
  // one fails — so check for a session before calling it a failure.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return NextResponse.redirect(new URL(next, origin));

  logFailure(request, error.code ?? error.message);
  return toApply(origin, "signin_failed");
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

/**
 * One line per failed sign-in in the Vercel logs: the reason, a coarse
 * browser label, and whether the secret cookie came back. No names, emails,
 * IDs or full user agents. A missing verifier points at a cookie problem
 * (in-app browser, a different browser after the Discord app handoff);
 * a present-but-wrong one points at a second sign-in that replaced it.
 */
function logFailure(request: NextRequest, reason: string) {
  const verifier = hasCodeVerifier(request.cookies.getAll().map((c) => c.name));
  console.warn(
    `[auth] callback failed reason=${reason} browser=${browserKind(request.headers.get("user-agent"))} verifier=${verifier ? "present" : "missing"}`,
  );
}

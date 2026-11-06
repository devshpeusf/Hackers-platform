/**
 * Small, dependency-free helpers for the Discord sign-in routes
 * (/auth/signin, /auth/callback) and the /apply error message.
 *
 * Why they exist: signing in uses a one-time secret (the PKCE code
 * verifier) stored in a cookie. Every request to /auth/signin makes a new
 * secret and overwrites the cookie, so any extra request in the background
 * (a link prefetch, a browser preload) can replace the secret Discord's code
 * was made for, and the callback then fails. These helpers let the routes
 * refuse those background requests, tell the different failures apart, and
 * show the right message for each.
 */

type HeaderReader = { get(name: string): string | null };

/** Set by the callback when it retries once automatically; stops a loop. */
export const RETRY_COOKIE = "signin_retry";

/**
 * True for requests a browser or Next.js makes ahead of time rather than
 * because someone clicked: Next.js router prefetches and RSC fetches, and
 * browser speculative loads (Sec-Purpose / Purpose: prefetch). Answering
 * these must not touch the sign-in cookie.
 */
export function isBackgroundRequest(headers: HeaderReader): boolean {
  if (headers.get("next-router-prefetch")) return true;
  if (headers.get("rsc")) return true;
  const purpose = `${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""}`.toLowerCase();
  return purpose.includes("prefetch") || purpose.includes("prerender");
}

/**
 * A coarse label for the browser, for logs only. Never the full user agent:
 * enough to tell whether failures cluster in in-app browsers, nothing more.
 */
export function browserKind(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const device = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "desktop";
  let app = "browser";
  if (/Discord/i.test(ua)) app = "discord-app";
  else if (/Instagram/i.test(ua)) app = "instagram-app";
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) app = "facebook-app";
  else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) app = "tiktok-app";
  else if (/LinkedInApp|Snapchat|Twitter/i.test(ua)) app = "other-app";
  return `${device}/${app}`;
}

/** Whether the sign-in secret cookie made it back to the callback. */
export function hasCodeVerifier(cookieNames: string[]): boolean {
  return cookieNames.some((name) => name.endsWith("-code-verifier"));
}

/**
 * Why a sign-in didn't finish, in our words. These are the values the
 * callback puts in /apply?error= and records in SignInFailure.reason.
 *
 * - verify_email: the Discord account's email isn't verified, so Supabase
 *   won't sign them in. Every attempt fails until they verify it.
 * - no_email: the Discord account has no email at all (signed up by phone).
 * - cancelled: they pressed Cancel on Discord's screen.
 * - missing_verifier: the secret cookie didn't come back (in-app browser,
 *   or the Discord app returned them in a different browser).
 * - failed: anything else; a retry usually works.
 */
export type SignInFailureReason = "verify_email" | "no_email" | "cancelled" | "missing_verifier" | "failed";

/**
 * Classifies the error Supabase sends back to the callback. Supabase passes
 * error (an OAuth-style category), error_code (its own, specific) and
 * error_description (a sentence). The code and sentence are checked first:
 * an unverified email arrives looking like a generic error otherwise.
 */
export function classifyProviderError(
  error: string,
  code: string | null,
  description: string | null,
): SignInFailureReason {
  const text = description ?? "";
  if (code === "provider_email_needs_verification" || /unverified email/i.test(text)) return "verify_email";
  if (/error getting user email/i.test(text)) return "no_email";
  if (error === "access_denied" && (!code || code === "access_denied")) return "cancelled";
  return "failed";
}

/** Which message /apply shows. */
export type SignInProblem = "verify_email" | "no_email" | "cancelled" | "failed" | "signin_required";

/**
 * Maps /apply's query to a message. ?error= comes from the sign-in routes;
 * ?signin=required from the pages that need a session, when there isn't one.
 * Unknown error values get the general "try again" message.
 */
export function signInProblem(
  error: string | string[] | undefined,
  signin?: string | string[] | undefined,
): SignInProblem | null {
  const value = Array.isArray(error) ? error[0] : error;
  if (value) {
    if (value === "verify_email" || value === "no_email" || value === "cancelled") return value;
    // Discord's own cancel value, from before the callback translated it.
    if (value === "access_denied") return "cancelled";
    return "failed";
  }
  const required = Array.isArray(signin) ? signin[0] : signin;
  return required === "required" ? "signin_required" : null;
}

/**
 * Small, dependency-free helpers for the Discord sign-in routes
 * (/auth/signin, /auth/callback) and the /apply error message.
 *
 * Why they exist: signing in uses a one-time secret (the PKCE code
 * verifier) stored in a cookie. Every request to /auth/signin makes a new
 * secret and overwrites the cookie, so any extra request in the background
 * (a link prefetch, a browser preload) can replace the secret Discord's code
 * was made for, and the callback then fails. These helpers let the routes
 * refuse those background requests, and let us log why a sign-in failed.
 */

type HeaderReader = { get(name: string): string | null };

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

export type SignInProblem = "cancelled" | "failed";

/**
 * Maps the ?error= value on /apply to which message to show. Discord sends
 * access_denied when someone presses Cancel; everything else is a sign-in
 * that didn't finish, and gets the same calm "try again" message.
 */
export function signInProblem(error: string | string[] | undefined): SignInProblem | null {
  const value = Array.isArray(error) ? error[0] : error;
  if (!value) return null;
  return value === "access_denied" ? "cancelled" : "failed";
}

/**
 * The public origin this request arrived on.
 *
 * `new URL(request.url).origin` is wrong behind Vercel: their proxy rewrites
 * the Host header to the deployment host, so a visitor on
 * apply.hackjam26.com produces "https://<deployment>.vercel.app". Anything we
 * redirect to with that origin moves them off the custom domain — which is
 * exactly what happened after sign-in, since the OAuth `redirectTo` was built
 * from it.
 *
 * Order matters:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — explicit and deterministic. OAuth redirect URLs
 *    are validated against an allowlist in the Supabase dashboard, so the one
 *    we send has to be predictable, not whatever host the request happened to
 *    carry.
 * 2. `x-forwarded-host` — what the visitor actually typed. Set by Vercel's
 *    proxy. Worth knowing a client can forge this header when nothing
 *    trustworthy sits in front of the app, which is the other reason the env
 *    var wins when it's set.
 * 3. The request URL — correct locally, where nothing is proxying.
 */
export function getSiteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const host = request.headers.get("x-forwarded-host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

/** Background email links use trusted configuration, never request headers. */
export function getRsvpBaseUrl(configured: string | undefined): string {
  const invalid = () => new Error("RSVP_URL must be an absolute HTTPS URL ending in /rsvp (HTTP is allowed on loopback hosts)");
  const value = configured?.trim();
  if (!value || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) throw invalid();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // URL parser exceptions can contain the input, including embedded secrets.
    throw invalid();
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash ||
    url.pathname.replace(/\/+$/, "") !== "/rsvp"
  ) throw invalid();

  return `${url.origin}/rsvp`;
}

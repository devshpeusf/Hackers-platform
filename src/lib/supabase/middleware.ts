import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSiteOrigin } from "@/lib/site-url";

/** Routes that require a signed-in applicant. */
const PROTECTED = ["/apply/form", "/apply/status", "/apply/applied"];

/**
 * Refreshes the auth session on every request, and gates the protected routes.
 *
 * The getUser() call is the point of this file: it revalidates the token with
 * Supabase and writes refreshed cookies onto the response. Without it sessions
 * expire mid-application. Do not add logic between createServerClient and
 * getUser — anything that returns early there skips the refresh.
 */
export async function updateSession(request: NextRequest) {
  // Vercel always serves the *.vercel.app deployment domain and it can't be
  // turned off, so someone can land on it instead of the real one. That's not
  // just cosmetic: OAuth starts by setting a PKCE cookie on whatever host you
  // began on, and the callback always returns to the canonical host. Different
  // host, no cookie, the code exchange fails — and you get bounced back to
  // /apply looking like sign-in silently did nothing.
  //
  // Only in production: preview deployments legitimately have their own host,
  // and NEXT_PUBLIC_SITE_URL is scoped to production so they fall through to
  // their own forwarded host.
  const canonical = process.env.NEXT_PUBLIC_SITE_URL;
  if (canonical && process.env.VERCEL_ENV === "production") {
    const host = request.headers.get("x-forwarded-host");
    const canonicalHost = new URL(canonical).host;
    if (host && host !== canonicalHost) {
      const target = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical);
      return NextResponse.redirect(target, 308);
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!user && needsAuth) {
    // Send them back to the landing screen rather than a dead end. Once real
    // sign-in works this is what stops someone deep-linking into the form.
    // Built from the public origin, not nextUrl: behind Vercel's proxy
    // nextUrl carries the deployment host, which would bounce the
    // visitor off the custom domain.
    const url = new URL("/apply", getSiteOrigin(request));
    url.searchParams.set("signin", "required");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

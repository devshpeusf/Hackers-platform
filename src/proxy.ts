import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next 16 renamed the `middleware` file convention to `proxy`; the old name
 * still works but warns on every dev boot and build.
 *
 * The Supabase helper this delegates to keeps its own name — that's Supabase's
 * convention for the file, not Next's.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /** Everything except static assets — those carry no session. */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

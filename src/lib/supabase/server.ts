import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, route handlers and server actions.
 *
 * Build it per request — never hoist the returned client to module scope, or
 * one visitor's session leaks into another's request.
 *
 * Scope is auth and storage. Application data goes through Prisma so
 * prisma/schema.prisma stays the single source of truth for our tables.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies. Safe to swallow — the
            // middleware refreshes the session on every request.
          }
        },
      },
    },
  );
}

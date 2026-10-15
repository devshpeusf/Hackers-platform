import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client, for storage reads an organizer is entitled to
 * but their own session can't perform (PLAT-30).
 *
 * The `resumes` bucket is private and its only SELECT policy scopes reads to
 * the uploader's own folder:
 *
 *     (storage.foldername(name))[1] = auth.uid()::text
 *
 * That's correct for applicants — nobody should read anyone else's resume —
 * but it means an organizer signed in as themselves is also refused. The
 * alternative was a second storage policy recognising organizers, which would
 * put "who is an organizer" in both Postgres policy SQL and app code, keyed
 * off a Discord id dug out of the JWT. Authorization already lives in one
 * place (Person.role, via isOrganizer), so this keeps it there: the gate is
 * checked in the route, and only then does this client bypass RLS.
 *
 * NEVER import this from a Client Component or pass the client to one. The key
 * is a full bypass of every policy in the project. It's read from a variable
 * without the NEXT_PUBLIC_ prefix precisely so Next refuses to inline it into
 * a browser bundle — but that's a backstop, not permission.
 *
 * Built per call rather than at module scope: throwing on a missing key at
 * import time would take down every route that merely shares a chunk with
 * this file, which is how the Resend client used to break `npm run build`.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — organizers can't open resumes without it",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      // No session to persist or refresh: this client is never a user.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

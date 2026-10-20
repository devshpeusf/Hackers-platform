import type { User } from "@supabase/supabase-js";

/**
 * What we know about an applicant from Discord alone.
 *
 * Supabase normalises each provider's profile into `user_metadata`, but the
 * exact keys vary by provider and have changed across Supabase versions — so
 * every field below reads through a short fallback chain rather than trusting
 * one key. `raw` is kept so the real shape can be inspected the first time
 * someone signs in for real.
 */
export type ApplicantIdentity = {
  /**
   * Supabase's own internal user id (what `auth.uid()` returns in Postgres),
   * NOT the same value as discordId below. Storage RLS policies can only
   * check `auth.uid()` — Postgres has no native concept of "Discord id", that
   * only exists because this app reads it off the provider identity. Needed for
   * the resume upload path, which writes into a per-user folder keyed on
   * this value; using discordId there would make every upload fail RLS.
   */
  supabaseUserId: string;
  /**
   * Discord's own user id — the identity applications, organizer status and
   * ownership are keyed on. Read ONLY from Supabase's provider identity (see
   * verifiedDiscordId), never from user_metadata, which the user can edit.
   * Null when the session has no Discord identity: callers must treat that
   * as "not signed in", never fall back to something else.
   */
  discordId: string | null;
  /** The @handle, e.g. "mreyes". */
  username: string;
  /** Discord's display name if set, otherwise the handle. */
  displayName: string;
  avatarUrl: string | null;
  /**
   * Discord account email. Present because Supabase requests the `email`
   * scope by default. Treat it as a DEFAULT, not the answer — plenty of
   * people's Discord email isn't the one they want event mail on, so the
   * form leaves it editable.
   */
  email: string | null;
  raw: Record<string, unknown>;
};

/**
 * Discord retired discriminators: modern accounts report "#0", which is a
 * placeholder meaning "no discriminator" and shouldn't be shown to anyone.
 * Legacy accounts still carry a real one (#1234) that IS part of their name,
 * so only "#0" is stripped.
 */
function stripDeadDiscriminator(name: string): string {
  return name.replace(/#0$/, "");
}

function pick(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/**
 * The signed-in user's Discord id, from the provider identity Supabase Auth
 * records at sign-in — the same source src/lib/current-hacker.ts uses.
 *
 * NOT from user_metadata. Any signed-in user can rewrite their own metadata
 * with the public key (supabase.auth.updateUser({ data })), so an id read
 * from there is whatever they typed: someone could set provider_id to
 * another applicant's Discord id to read or overwrite that application, or
 * to an organizer's to get into /admin. That's exactly what this used to do,
 * metadata first.
 *
 * Returns null rather than falling back when there's no Discord identity.
 */
export function verifiedDiscordId(user: User): string | null {
  const discord = user.identities?.find((identity) => identity.provider === "discord");
  const sub: unknown = discord?.identity_data?.sub;
  return typeof sub === "string" && sub.trim() ? sub : null;
}

/**
 * Display details come from user_metadata, which is fine: a user editing
 * their own handle or avatar only changes what they see. Anything that
 * decides access or ownership uses discordId, which doesn't come from there.
 */
export function toApplicantIdentity(user: User): ApplicantIdentity {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const claims = (meta.custom_claims ?? {}) as Record<string, unknown>;

  const username = stripDeadDiscriminator(
    pick(meta, "preferred_username", "user_name", "name", "full_name") ??
      pick(claims, "global_name") ??
      "unknown",
  );

  return {
    supabaseUserId: user.id,
    discordId: verifiedDiscordId(user),
    username,
    displayName: pick(claims, "global_name") ?? pick(meta, "full_name", "name") ?? username,
    avatarUrl: pick(meta, "avatar_url", "picture"),
    email: user.email ?? pick(meta, "email"),
    raw: meta,
  };
}

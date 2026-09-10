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
  /** Discord's own user id — the stable identity to key an application on. */
  discordId: string;
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

function pick(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

export function toApplicantIdentity(user: User): ApplicantIdentity {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const claims = (meta.custom_claims ?? {}) as Record<string, unknown>;

  const username =
    pick(meta, "preferred_username", "user_name", "name", "full_name") ??
    pick(claims, "global_name") ??
    "unknown";

  return {
    discordId:
      pick(meta, "provider_id", "sub") ??
      user.identities?.find((i) => i.provider === "discord")?.id ??
      user.id,
    username,
    displayName: pick(claims, "global_name") ?? pick(meta, "full_name", "name") ?? username,
    avatarUrl: pick(meta, "avatar_url", "picture"),
    email: user.email ?? pick(meta, "email"),
    raw: meta,
  };
}

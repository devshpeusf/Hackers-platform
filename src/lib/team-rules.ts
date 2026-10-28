/**
 * Team rules that both the server (src/lib/teams.ts) and the /team page need.
 * No server-only imports, so the browser can use them too — one source for
 * the size cap and name length instead of a copy on each side.
 */

export const TEAM_MAX = 3;
export const TEAM_NAME_MAX = 40;

/** No 0/O, 1/I/L — codes get read aloud and typed from screenshots. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/**
 * Forgiving about how a code is typed: case, spaces, dashes, and a missing
 * "HJ" prefix are all fine. Returns the canonical "HJ-XXXXXX", or null if it
 * can't be a real code.
 */
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let compact = raw.toUpperCase().replace(/[\s-]/g, "");
  if (compact.startsWith("HJ") && compact.length === CODE_LENGTH + 2) compact = compact.slice(2);
  if (compact.length !== CODE_LENGTH) return null;
  for (const ch of compact) if (!CODE_ALPHABET.includes(ch)) return null;
  return `HJ-${compact}`;
}

export function normalizeTeamName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) return { ok: false, error: "Give your team a name." };
  if (name.length > TEAM_NAME_MAX) return { ok: false, error: `Keep the name under ${TEAM_NAME_MAX} characters.` };
  return { ok: true, name };
}

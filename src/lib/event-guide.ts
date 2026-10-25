/**
 * The hacker guide's content rules — shared by /guide (reading) and
 * /admin/event (editing). Plain functions, no database, so they're testable.
 */

export const DEFAULT_CODE_OF_CONDUCT_URL = "https://mlh.io/code-of-conduct";

/** The Event columns the guide uses. */
export type EventGuide = {
  venueName: string | null;
  venueAddress: string | null;
  parkingInfo: string | null;
  wifiInfo: string | null;
  whatToBring: string[];
  codeOfConductUrl: string | null;
  /** The full guide document. Empty shows an "in progress" state on /guide. */
  hackerGuideUrl: string | null;
};

/** A Google Maps search for the address — no extra field to maintain. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Field limits for the admin form. Generous, but they stop a paste accident. */
const LIMITS = {
  venueName: 120,
  venueAddress: 200,
  parkingInfo: 600,
  wifiInfo: 600,
  codeOfConductUrl: 300,
  hackerGuideUrl: 500,
  whatToBringItem: 100,
  whatToBringItems: 20,
} as const;

const TEXT_FIELDS = ["venueName", "venueAddress", "parkingInfo", "wifiInfo"] as const;

function text(raw: FormDataEntryValue | null): string {
  // Normalise Windows line endings so a pasted value round-trips cleanly.
  return typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
}

/**
 * An optional link field: empty saves as null; anything else must be a real
 * https URL — the same "banana isn't a URL" rule the application form uses,
 * and nothing like javascript: that would run when clicked.
 */
function link(
  formData: FormData,
  field: "codeOfConductUrl" | "hackerGuideUrl",
  errors: Record<string, string>,
  message: string,
): string | null {
  const url = text(formData.get(field));
  if (!url) return null;
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== "https:" || !parsed.hostname.includes(".") || url.length > LIMITS[field]) {
    errors[field] = message;
  }
  return url;
}

/**
 * Reads and validates the /admin/event form. An empty field saves as null
 * (the guide shows "TBA"); "what to bring" is one item per line.
 */
export function parseGuideForm(
  formData: FormData,
): { ok: true; data: EventGuide } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const data = {} as EventGuide;

  for (const field of TEXT_FIELDS) {
    const value = text(formData.get(field));
    if (value.length > LIMITS[field]) errors[field] = `Keep this under ${LIMITS[field]} characters.`;
    data[field] = value || null;
  }

  const items = text(formData.get("whatToBring"))
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\[\s?\])\s*/, "").trim())
    .filter(Boolean);
  if (items.length > LIMITS.whatToBringItems) {
    errors.whatToBring = `Keep it to ${LIMITS.whatToBringItems} items or fewer.`;
  } else if (items.some((item) => item.length > LIMITS.whatToBringItem)) {
    errors.whatToBring = `Keep each item under ${LIMITS.whatToBringItem} characters.`;
  }
  data.whatToBring = items;

  data.codeOfConductUrl = link(formData, "codeOfConductUrl", errors, "Use a full https:// link, or leave it empty for MLH's.");
  data.hackerGuideUrl = link(formData, "hackerGuideUrl", errors, "Use a full https:// link, or leave it empty for now.");

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

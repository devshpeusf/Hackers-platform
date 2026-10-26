/**
 * The hacker guide's content rules — shared by /guide (reading) and
 * /admin/event (editing). Plain functions, no database, so they're testable.
 */

export const DEFAULT_CODE_OF_CONDUCT_URL = "https://mlh.io/code-of-conduct";

/** The Event columns the guide uses. */
export type EventGuide = {
  parkingInfo: string | null;
  wifiInfo: string | null;
  whatToBring: string[];
  codeOfConductUrl: string | null;
  /** The full guide document. Empty shows an "in progress" state on /guide. */
  hackerGuideUrl: string | null;
  /** Discord invite for questions. */
  discordUrl: string | null;
  /** Organizer email — the private channel (e.g. Code of Conduct concerns). */
  contactEmail: string | null;
};

/** A Google Maps search for the address — no extra field to maintain. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Field limits for the admin form. Generous, but they stop a paste accident. */
const LIMITS = {
  parkingInfo: 600,
  wifiInfo: 600,
  codeOfConductUrl: 300,
  hackerGuideUrl: 500,
  discordUrl: 300,
  contactEmail: 120,
  whatToBringItem: 100,
  whatToBringItems: 20,
} as const;

const TEXT_FIELDS = ["parkingInfo", "wifiInfo"] as const;

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
  field: "codeOfConductUrl" | "hackerGuideUrl" | "discordUrl",
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
  data.discordUrl = link(formData, "discordUrl", errors, "Use a full https:// link, like https://discord.gg/…");

  // A plain shape check, not deliverability: catches typos like a missing @.
  const email = text(formData.get("contactEmail"));
  if (email && (email.length > LIMITS.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    errors.contactEmail = "That doesn't look like an email address.";
  }
  data.contactEmail = email || null;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

// ---------------------------------------------------------------------------
// Locations (Event.locations): where things happen, in display order.
// ---------------------------------------------------------------------------

export type EventLocation = {
  /** What happens there, e.g. "Main venue" or "Ceremonies". */
  label: string;
  /** The building or room, e.g. "ENB". */
  place: string;
  /** One line of detail, e.g. "Hacking, food and workshops happen here". */
  note: string | null;
  /** Gives this place its own Maps link. */
  address: string | null;
};

export const LOCATION_LIMITS = { rows: 10, label: 40, place: 120, note: 200, address: 200 } as const;

const clip = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Reads the stored JSON defensively — it can be edited by hand in Supabase,
 * so a typo must never break the page. A row needs a label and a place;
 * anything else is skipped.
 */
export function parseLocations(value: unknown): EventLocation[] {
  if (!Array.isArray(value)) return [];
  const rows: EventLocation[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = clip(r.label, LOCATION_LIMITS.label);
    const place = clip(r.place, LOCATION_LIMITS.place);
    if (!label || !place) continue;
    rows.push({ label, place, note: clip(r.note, LOCATION_LIMITS.note), address: clip(r.address, LOCATION_LIMITS.address) });
    if (rows.length === LOCATION_LIMITS.rows) break;
  }
  return rows;
}

/** The main venue, for one-line mentions like the dashboard header. */
export function mainVenue(locations: readonly EventLocation[]): string | null {
  return locations[0]?.place ?? null;
}

/**
 * Reads the /admin/event locations form: parallel `locLabel`, `locPlace`,
 * `locNote` and `locAddress` fields, one of each per row, in display order.
 * A fully empty row is dropped; label and place are required otherwise.
 */
export function parseLocationsForm(
  formData: FormData,
): { ok: true; rows: EventLocation[] } | { ok: false; error: string } {
  const fields = ["locLabel", "locPlace", "locNote", "locAddress"].map((f) =>
    formData.getAll(f).map((v) => (typeof v === "string" ? v.trim() : "")),
  );
  const [labels, places, notes, addresses] = fields;
  if (fields.some((f) => f.length !== labels.length)) {
    return { ok: false, error: "The form was incomplete. Reload the page and try again." };
  }

  const rows: EventLocation[] = [];
  for (let i = 0; i < labels.length; i++) {
    const [label, place, note, address] = [labels[i], places[i], notes[i], addresses[i]];
    if (!label && !place && !note && !address) continue;
    if (!label || !place) return { ok: false, error: `Location ${i + 1} needs both a label and a place.` };
    const limits: [string, string, number][] = [
      ["label", label, LOCATION_LIMITS.label],
      ["place", place, LOCATION_LIMITS.place],
      ["note", note, LOCATION_LIMITS.note],
      ["address", address, LOCATION_LIMITS.address],
    ];
    for (const [name, value, max] of limits) {
      if (value.length > max) return { ok: false, error: `Location ${i + 1}: keep the ${name} under ${max} characters.` };
    }
    rows.push({ label, place, note: note || null, address: address || null });
  }
  if (rows.length > LOCATION_LIMITS.rows) {
    return { ok: false, error: `Keep it to ${LOCATION_LIMITS.rows} locations or fewer.` };
  }
  return { ok: true, rows };
}

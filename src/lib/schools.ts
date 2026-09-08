/**
 * The MLH-verified school list 
 *
 * Deliberately NOT in `placeholder-data.ts` — that file is scaffolding
 * meant to be deleted wholesale once real data lands. This is real
 * reference data that outlives it. Regenerate with
 * `node scripts/update-schools.mjs` when MLH updates their list.
 *
 * SIZE WARNING: the backing JSON is ~500KB (13k entries). Importing
 * this module from a Client Component ships all of it to the browser.
 * The school picker (PLAT-15) should call `searchSchools` on the
 * server — a route handler or server action returning only the top
 * matches — rather than filtering a client-side copy.
 */

import schoolsData from "@/data/schools.json";

/** Every MLH-verified school name, deduplicated and alphabetically sorted. */
export const schools: readonly string[] = schoolsData;

/**
 * Words skipped when deriving an acronym, so "University of South
 * Florida" yields "usf" rather than "uosf".
 */
const ACRONYM_STOPWORDS = new Set([
  "of", "the", "at", "and", "for", "in", "on",
  "de", "du", "des", "la", "le", "les", "el", "y", "da", "do",
]);

/**
 * Lowercases, strips diacritics, and collapses whitespace so that
 * "universite du quebec" matches "Université du Québec". 1,267 entries
 * in MLH's list carry accents or en-dashes, so this is not optional.
 * En/em dashes fold to a plain "-" so a typed hyphen matches too.
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** First letter of each significant word: "usf" for USF. */
function acronymOf(normalized: string): string {
  return normalized
    .split(/[\s\-–—.,()]+/)
    .filter((word) => word && !ACRONYM_STOPWORDS.has(word))
    .map((word) => word[0])
    .join("");
}

type IndexEntry = {
  name: string;
  normalized: string;
  acronym: string;
};

/**
 * Built once on first use. Normalizing 13k names is far too expensive
 * to redo per keystroke, so the cost is paid a single time and every
 * later search is plain string comparison.
 */
let index: IndexEntry[] | null = null;
let lookup: Map<string, string> | null = null;

function getIndex(): IndexEntry[] {
  if (!index) {
    index = schools.map((name) => {
      const normalized = normalize(name);
      return { name, normalized, acronym: acronymOf(normalized) };
    });
    lookup = new Map(index.map((entry) => [entry.normalized, entry.name]));
  }
  return index;
}

function getLookup(): Map<string, string> {
  getIndex();
  return lookup!;
}

export type SearchOptions = {
  /** Maximum matches to return. Defaults to 10. */
  limit?: number;
  /**
   * School names to surface first among equally-ranked matches — the
   * host school for the event being applied to, typically.
   *
   * This exists because acronyms collide badly: "usf" is a valid
   * acronym for six schools, and plain tie-breaking buries the one the
   * applicant almost certainly means. The host school is event data
   * (see CLAUDE.md on staying multi-event), so it is passed in by the
   * caller rather than known here.
   */
  boost?: readonly string[];
};

export type SchoolMatch = {
  /** The canonical school name, exactly as MLH spells it. */
  name: string;
  /** Lower is better: 0 exact, 1 prefix, 2 word-start, 3 acronym, 4 substring. */
  rank: number;
};

/**
 * Ranked search over the school list.
 *
 * Ranking matters for the behaviour PLAT-15 describes ("type 'South
 * Fl', it suggests USF"): that query hits the *middle* of "University
 * of South Florida", so plain prefix matching would miss it and plain
 * substring matching would bury it. Word-start matches therefore rank
 * above mid-word ones, and shorter names break ties.
 *
 * Acronyms are matched explicitly because their letters aren't
 * contiguous in the name — "usf" appears nowhere inside "University of
 * South Florida" as a substring. Because acronyms collide (six schools
 * answer to "usf"), pass `boost` with the event's host school.
 */
export function searchSchools(query: string, options: SearchOptions = {}): SchoolMatch[] {
  const { limit = 10, boost = [] } = options;
  const q = normalize(query);
  if (!q) return [];

  const boosted = new Set(boost.map(normalize));

  const matches: SchoolMatch[] = [];
  for (const entry of getIndex()) {
    const { name, normalized, acronym } = entry;
    let rank: number;
    if (normalized === q) rank = 0;
    else if (normalized.startsWith(q)) rank = 1;
    else if (normalized.includes(` ${q}`)) rank = 2;
    else if (acronym === q) rank = 3;
    else if (normalized.includes(q)) rank = 4;
    else continue;
    matches.push({ name, rank });
  }

  return matches
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(boosted.has(normalize(b.name))) - Number(boosted.has(normalize(a.name))) ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name, "en"),
    )
    .slice(0, limit);
}

/**
 * Whether a name is on the MLH list. PLAT-15 specifies "no typing
 * whatever they want", so submitted values must be validated against
 * this rather than accepted as free text.
 */
export function isValidSchool(name: string): boolean {
  return getLookup().has(normalize(name));
}

/**
 * Resolves user input to MLH's canonical spelling, or undefined if it
 * isn't a verified school. Use this before persisting a school so the
 * stored value always matches MLH's list exactly.
 */
export function resolveSchool(name: string): string | undefined {
  return getLookup().get(normalize(name));
}

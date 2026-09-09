import { NextResponse } from "next/server";
import { searchSchools } from "@/lib/schools";
import { boostedSchools } from "@/lib/placeholder-data";

/**
 * School typeahead endpoint (PLAT-15).
 *
 * This route exists for one reason: src/data/schools.json is 494KB. Importing
 * searchSchools directly into the Client Component would ship all 13,103
 * schools to every applicant's browser. Keeping the search on the server means
 * the wire only ever carries the handful of matches actually being shown.
 *
 *   GET /api/schools?q=usf          -> up to 8 matches
 *   GET /api/schools?q=usf&limit=3  -> up to 3
 *
 * Results are ranked by searchSchools (exact > prefix > word-start > acronym >
 * substring), with the host school boosted above its acronym twins.
 */

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
/** Longer than any real school name; guards against junk queries. */
const MAX_QUERY = 100;

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);

  const requested = Number(searchParams.get("limit"));
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, MAX_LIMIT)
      : DEFAULT_LIMIT;

  // An empty box shouldn't dump the first N schools alphabetically.
  if (!query) {
    return NextResponse.json({ query: "", matches: [] });
  }

  const matches = searchSchools(query, { limit, boost: boostedSchools });

  return NextResponse.json(
    { query, matches },
    {
      headers: {
        // The catalogue only changes when someone re-runs
        // scripts/update-schools.mjs, so the same query is safe to cache
        // hard. Typeaheads repeat prefixes constantly as people backspace.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}

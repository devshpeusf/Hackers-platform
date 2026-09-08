#!/usr/bin/env node
/**
 * Regenerates src/data/schools.json from MLH's canonical list of
 * manually-verified schools.
 *
 *   node scripts/update-schools.mjs
 *
 * MLH updates this list continuously (their CSV carries its own
 * "last updated" timestamp as the first row), so re-run this
 * periodically rather than treating the committed JSON as permanent.
 *
 * Dependency-free on purpose: the source is a single quoted column with
 * no embedded separators, so a real CSV parser would be overkill —
 * see CLAUDE.md on not adding a dependency for a small job.
 */

const SOURCE = "https://raw.githubusercontent.com/MLH/mlh-policies/main/schools.csv";
const OUT = new URL("../src/data/schools.json", import.meta.url);

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`Failed to fetch MLH school list: ${response.status} ${response.statusText}`);
}
const csv = await response.text();

const rows = csv.split("\n");
// Row 0 is MLH's prose description + timestamp, not a column header.
const header = rows[0];
const names = rows
  .slice(1)
  .map((row) => row.trim().replace(/^"/, "").replace(/"$/, "").trim())
  .filter(Boolean);

// MLH's list contains exact duplicates (388 as of 2026-09-08).
const deduped = [...new Set(names)].sort((a, b) => a.localeCompare(b, "en"));

// One entry per line so `git diff` stays readable when MLH adds schools.
await import("node:fs/promises").then((fs) =>
  fs.writeFile(OUT, JSON.stringify(deduped, null, 2) + "\n", "utf8"),
);

console.log(`source header: ${header.slice(0, 120)}…`);
console.log(`parsed ${names.length} rows → ${deduped.length} unique schools`);
console.log(`wrote ${OUT.pathname}`);

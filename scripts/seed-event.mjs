#!/usr/bin/env node
/**
 * Seeds the event applications attach to.
 *
 *   node scripts/seed-event.mjs
 *
 * Application.eventId is required, so without a row here every submission
 * fails. Idempotent — safe to re-run.
 *
 * Dates are placeholders until the real ones are confirmed; getOpenEvent()
 * treats an event as open while endDate is in the future, so endDate is what
 * closes applications today. A proper application window
 * (applicationOpen / applicationDeadline) belongs on the Event table — see
 * the note in src/lib/events.ts.
 */
import "dotenv/config";
import { Client } from "pg";

const NAME = "HackJam '26";
const START = "2026-11-07T09:00:00Z";
const END = "2026-11-08T18:00:00Z";
// Same link as placeholder-data.ts's mlhRegistration.url — the confirmation
// email reads this from the event row instead, so a future event doesn't
// inherit this one's link the way a hardcoded string would.
const ORGANIZER_HQ_URL = "https://events.mlh.com/events/14412-hackjam-26?intent=register";
// Hacker guide defaults. Venue and parking are left empty ("TBA" on /guide)
// until confirmed; edit them at /admin/event.
const WIFI_INFO = "Connect to eduroam with your school login, or USF-Guest (open network, no password).";
const WHAT_TO_BRING = ["Laptop & charger", "Student ID", "Valid photo ID", "Refillable water bottle"];
const CODE_OF_CONDUCT_URL = "https://mlh.io/code-of-conduct";

const db = new Client({ connectionString: process.env.DIRECT_URL });
await db.connect();

const existing = await db.query('select id, name from "Event" where name = $1', [NAME]);
if (existing.rowCount) {
  console.log(`already seeded: ${existing.rows[0].name} (${existing.rows[0].id})`);
} else {
  const id = crypto.randomUUID();
  await db.query(
    'insert into "Event" (id, name, "startDate", "endDate", "organizerHqUrl", "wifiInfo", "whatToBring", "codeOfConductUrl") values ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, NAME, START, END, ORGANIZER_HQ_URL, WIFI_INFO, WHAT_TO_BRING, CODE_OF_CONDUCT_URL],
  );
  console.log(`seeded: ${NAME} (${id})`);
}
await db.end();

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

const db = new Client({ connectionString: process.env.DIRECT_URL });
await db.connect();

const existing = await db.query('select id, name from "Event" where name = $1', [NAME]);
if (existing.rowCount) {
  console.log(`already seeded: ${existing.rows[0].name} (${existing.rows[0].id})`);
} else {
  const id = crypto.randomUUID();
  await db.query(
    'insert into "Event" (id, name, "startDate", "endDate") values ($1, $2, $3, $4)',
    [id, NAME, START, END],
  );
  console.log(`seeded: ${NAME} (${id})`);
}
await db.end();

-- Venue becomes a list of locations (label, place, note?, address?).
-- Written by hand so the existing venue is carried over BEFORE the old
-- columns are dropped — a generated migration would just drop them.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "locations" JSONB NOT NULL DEFAULT '[]';

-- Carry over HackJam '26's venue (main venue ENB, ceremonies at CMC).
UPDATE "Event"
SET "locations" = '[
  {"label": "Main venue", "place": "ENB", "note": "Hacking, food and workshops happen here"},
  {"label": "Ceremonies", "place": "CMC", "note": "Opening & closing ceremonies"}
]'::jsonb
WHERE "name" = 'HackJam ''26';

-- The list replaces these; nothing reads them after this change.
ALTER TABLE "Event" DROP COLUMN "venueName",
DROP COLUMN "venueAddress";

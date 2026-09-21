-- AlterTable: add as nullable first so the existing row can be backfilled
-- before the NOT NULL constraint goes on.
ALTER TABLE "Event" ADD COLUMN     "organizerHqUrl" TEXT;

-- Backfill with the real HackJam '26 MLH registration link (matches
-- placeholder-data.ts's mlhRegistration.url) rather than a placeholder —
-- the actual value was already known when this migration was written.
UPDATE "Event" SET "organizerHqUrl" = 'https://events.mlh.com/events/14412-hackjam-26?intent=register' WHERE "organizerHqUrl" IS NULL;

-- Now safe to require it for every future event.
ALTER TABLE "Event" ALTER COLUMN "organizerHqUrl" SET NOT NULL;

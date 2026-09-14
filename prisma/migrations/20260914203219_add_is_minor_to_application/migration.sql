-- AlterTable: add as nullable first so existing rows can be backfilled
-- before the NOT NULL constraint goes on.
ALTER TABLE "Application" ADD COLUMN     "isMinor" BOOLEAN;

-- Backfill: compute from each row's own dateOfBirth vs. its Event's
-- startDate — the same rule as computeIsMinor() in application-schema.ts —
-- rather than guessing a default for existing rows.
UPDATE "Application"
SET "isMinor" = ("Application"."dateOfBirth" > ("Event"."startDate" - INTERVAL '18 years'))
FROM "Event"
WHERE "Application"."eventId" = "Event"."id";

-- Now safe to require it for every future row.
ALTER TABLE "Application" ALTER COLUMN "isMinor" SET NOT NULL;

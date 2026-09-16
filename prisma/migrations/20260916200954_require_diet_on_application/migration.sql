-- Backfill existing rows before the NOT NULL constraint goes on — these
-- were submitted before this question existed, so "No restriction" is the
-- honest default rather than a guess at what they'd have picked.
UPDATE "Application" SET "diet" = 'No restriction' WHERE "diet" IS NULL;

-- AlterTable
ALTER TABLE "Application" ALTER COLUMN "diet" SET NOT NULL;

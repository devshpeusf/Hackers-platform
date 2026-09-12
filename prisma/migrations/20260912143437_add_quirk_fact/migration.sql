/*
  Warnings:

  - Added the required column `quirkFact` to the `Application` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: add as nullable first, backfill existing rows, then enforce NOT NULL
ALTER TABLE "Application" ADD COLUMN     "quirkFact" TEXT;

UPDATE "Application" SET "quirkFact" = '[No answer provided — added before this question existed]' WHERE "quirkFact" IS NULL;

ALTER TABLE "Application" ALTER COLUMN "quirkFact" SET NOT NULL;

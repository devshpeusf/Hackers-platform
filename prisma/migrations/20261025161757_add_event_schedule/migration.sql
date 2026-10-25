-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "schedule" JSONB NOT NULL DEFAULT '[]';

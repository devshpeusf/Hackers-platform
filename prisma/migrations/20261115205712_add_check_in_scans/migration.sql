-- CreateEnum
CREATE TYPE "CheckpointKind" AS ENUM ('MEAL', 'WORKSHOP');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedInById" TEXT;

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CheckpointKind" NOT NULL,

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkpointId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scannedById" TEXT NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkpoint_eventId_idx" ON "Checkpoint"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Scan_checkpointId_applicationId_key" ON "Scan"("checkpointId", "applicationId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "Checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only tables: closed to Supabase's public API like every app table.
ALTER TABLE "Checkpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Scan" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Checkpoint", "Scan" FROM anon, authenticated;

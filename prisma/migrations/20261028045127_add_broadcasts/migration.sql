-- Announcements to groups of hackers (/admin/email).
--
-- Written by hand: the shared database also has a teammate's unpushed
-- migration (20261028042641_add_mlh_reminder_email_type), and a generated
-- migration from this branch would have removed MLH_REMINDER from EmailType.
-- This only adds the broadcast enum and tables.

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('ACCEPTED_ALL', 'ACCEPTED_CONFIRMED', 'ACCEPTED_PENDING_RSVP', 'WAITLISTED', 'ALL_APPLICANTS', 'WALK_INS', 'ON_A_TEAM');


-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,
    "audience" "BroadcastAudience" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "broadcastId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broadcast_eventId_createdAt_idx" ON "Broadcast"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_status_createdAt_idx" ON "BroadcastRecipient"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_applicationId_key" ON "BroadcastRecipient"("broadcastId", "applicationId");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Server-only tables: closed to Supabase's public API like every app table.
ALTER TABLE "Broadcast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BroadcastRecipient" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Broadcast", "BroadcastRecipient" FROM anon, authenticated;

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('CONFIRMATION');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('APPLICANT', 'ORGANIZER');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "role" "PersonRole" NOT NULL DEFAULT 'APPLICANT';

-- CreateTable
CREATE TABLE "EmailQueue" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "applicationId" TEXT NOT NULL,
    "emailType" "EmailType" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "EmailQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailQueue_status_createdAt_idx" ON "EmailQueue"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailQueue_applicationId_emailType_key" ON "EmailQueue"("applicationId", "emailType");

-- AddForeignKey
ALTER TABLE "EmailQueue" ADD CONSTRAINT "EmailQueue_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

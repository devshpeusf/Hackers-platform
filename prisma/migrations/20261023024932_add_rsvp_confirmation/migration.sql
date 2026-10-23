-- PLAT-43: generated with Prisma 7.10 migrate diff between local schema files.
-- No database or shadow database was used. Transaction and access controls added.
BEGIN;

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "rsvpRespondedAt" TIMESTAMP(3),
ADD COLUMN     "rsvpStatus" "RsvpStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "RsvpToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenHash" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RsvpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RsvpToken_tokenHash_key" ON "RsvpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RsvpToken_applicationId_idx" ON "RsvpToken"("applicationId");

-- AddForeignKey
ALTER TABLE "RsvpToken" ADD CONSTRAINT "RsvpToken_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only table: no browser policies. Prisma's database role must have
-- appropriate owner/BYPASSRLS access; verify that role before shared rollout.
ALTER TABLE "RsvpToken" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RsvpToken" FROM PUBLIC, anon, authenticated;

COMMIT;

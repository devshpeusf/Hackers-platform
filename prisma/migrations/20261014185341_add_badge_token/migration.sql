-- Written by hand rather than by `prisma migrate dev`: the shared database
-- already has a teammate's unpushed migration (20261014152812_add_decision_fields),
-- and a generated migration from this branch would have dropped its columns.
-- This touches only the new badge column.

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "badgeToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Application_badgeToken_key" ON "Application"("badgeToken");

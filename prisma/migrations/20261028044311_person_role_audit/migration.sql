-- Written by hand: the shared database also has the teams migrations
-- (feat/teams, not merged yet), and a generated migration from this branch
-- would have dropped Person.discordUsername. Only the role audit columns.

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "roleChangedAt" TIMESTAMP(3),
ADD COLUMN "roleChangedById" TEXT;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_roleChangedById_fkey" FOREIGN KEY ("roleChangedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

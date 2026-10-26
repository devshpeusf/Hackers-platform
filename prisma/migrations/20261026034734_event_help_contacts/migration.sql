-- Written by hand rather than by `prisma migrate dev`: the shared database has
-- a teammate's unpushed migration (20261026024938_add_walk_in_source), and a
-- generated migration from this branch would have reverted it. This touches
-- only the two new Event columns.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "discordUrl" TEXT,
ADD COLUMN "contactEmail" TEXT;

-- HackJam '26's help contacts.
UPDATE "Event"
SET "discordUrl" = 'https://discord.gg/N9bjk9hmE',
    "contactEmail" = 'hackabull.dev@gmail.com'
WHERE "name" = 'HackJam ''26';

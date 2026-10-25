-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "codeOfConductUrl" TEXT,
ADD COLUMN     "parkingInfo" TEXT,
ADD COLUMN     "venueAddress" TEXT,
ADD COLUMN     "venueName" TEXT,
ADD COLUMN     "whatToBring" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "wifiInfo" TEXT;

-- Carry today's guide content over to the existing event so the page doesn't
-- go blank. Venue and parking stay NULL ("TBA") until they're confirmed.
UPDATE "Event"
SET
  "wifiInfo" = 'Connect to eduroam with your school login, or USF-Guest (open network, no password).',
  "whatToBring" = ARRAY['Laptop & charger', 'Student ID', 'Valid photo ID', 'Refillable water bottle'],
  "codeOfConductUrl" = 'https://mlh.io/code-of-conduct'
WHERE "name" = 'HackJam ''26';

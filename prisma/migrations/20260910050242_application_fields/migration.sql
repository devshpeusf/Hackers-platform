/*
  Warnings:

  - You are about to drop the column `age` on the `Application` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[discordId]` on the table `Person` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `agreedCodeOfConduct` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `agreedDataSharing` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `agreementsAt` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dateOfBirth` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `graduation` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `major` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shirtSize` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `whatBuild` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `whyAttend` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `discordId` to the `Person` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Person_phoneNum_key";

-- AlterTable
ALTER TABLE "Application" DROP COLUMN "age",
ADD COLUMN     "agreedCodeOfConduct" BOOLEAN NOT NULL,
ADD COLUMN     "agreedDataSharing" BOOLEAN NOT NULL,
ADD COLUMN     "agreedMarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "agreementsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "graduation" TEXT NOT NULL,
ADD COLUMN     "major" TEXT NOT NULL,
ADD COLUMN     "raceEthnicity" TEXT,
ADD COLUMN     "shirtSize" TEXT NOT NULL,
ADD COLUMN     "whatBuild" TEXT NOT NULL,
ADD COLUMN     "whyAttend" TEXT NOT NULL,
ALTER COLUMN "diet" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "discordId" TEXT NOT NULL,
ALTER COLUMN "phoneNum" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Person_discordId_key" ON "Person"("discordId");

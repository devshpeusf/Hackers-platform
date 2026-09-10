/*
  Warnings:

  - Made the column `phoneNum` on table `Person` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Person" ALTER COLUMN "phoneNum" SET NOT NULL;

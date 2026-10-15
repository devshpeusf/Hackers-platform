-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

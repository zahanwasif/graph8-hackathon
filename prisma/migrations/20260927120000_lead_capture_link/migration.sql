-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "captureId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_captureId_key" ON "Lead"("captureId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "Capture"("id") ON DELETE SET NULL ON UPDATE CASCADE;


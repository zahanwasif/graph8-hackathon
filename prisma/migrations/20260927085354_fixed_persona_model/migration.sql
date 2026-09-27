/*
  Warnings:

  - You are about to drop the column `extraction` on the `Capture` table. All the data in the column will be lost.
  - You are about to drop the column `outcomeRefs` on the `Capture` table. All the data in the column will be lost.
  - You are about to drop the column `outreachBody` on the `Capture` table. All the data in the column will be lost.
  - You are about to drop the column `outreachChannel` on the `Capture` table. All the data in the column will be lost.
  - You are about to drop the column `outreachSentAt` on the `Capture` table. All the data in the column will be lost.
  - You are about to drop the column `outreachSubject` on the `Capture` table. All the data in the column will be lost.
  - You are about to drop the column `personaId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the `Persona` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_personaId_fkey";

-- DropIndex
DROP INDEX "Event_personaId_idx";

-- AlterTable
ALTER TABLE "Capture" DROP COLUMN "extraction",
DROP COLUMN "outcomeRefs",
DROP COLUMN "outreachBody",
DROP COLUMN "outreachChannel",
DROP COLUMN "outreachSentAt",
DROP COLUMN "outreachSubject",
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "personCompany" TEXT,
ADD COLUMN     "personName" TEXT,
ADD COLUMN     "personTitle" TEXT,
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "personaId";

-- DropTable
DROP TABLE "Persona";

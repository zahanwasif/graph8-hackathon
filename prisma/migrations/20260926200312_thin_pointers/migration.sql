-- AlterEnum
BEGIN;
CREATE TYPE "CaptureStatus_new" AS ENUM ('RECEIVED', 'EXTRACTED', 'AWAITING_INFO', 'AWAITING_DISAMBIGUATION', 'RECORDED', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED');
ALTER TABLE "public"."Capture" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Capture" ALTER COLUMN "status" TYPE "CaptureStatus_new" USING ("status"::text::"CaptureStatus_new");
ALTER TYPE "CaptureStatus" RENAME TO "CaptureStatus_old";
ALTER TYPE "CaptureStatus_new" RENAME TO "CaptureStatus";
DROP TYPE "public"."CaptureStatus_old";
ALTER TABLE "Capture" ALTER COLUMN "status" SET DEFAULT 'RECEIVED';
COMMIT;

-- AlterTable
ALTER TABLE "Capture" DROP COLUMN "followUpBody",
DROP COLUMN "followUpSentAt",
DROP COLUMN "followUpSubject",
DROP COLUMN "graph8DealId",
DROP COLUMN "hotness",
DROP COLUMN "linkedinInviteSentAt",
ADD COLUMN     "disposition" TEXT,
ADD COLUMN     "fitScore" INTEGER,
ADD COLUMN     "graph8ExecutionId" TEXT,
ADD COLUMN     "outcomeRefs" JSONB,
ADD COLUMN     "outreachBody" TEXT,
ADD COLUMN     "outreachChannel" TEXT,
ADD COLUMN     "outreachSentAt" TIMESTAMP(3),
ADD COLUMN     "outreachSubject" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "graph8DraftSkillId" TEXT,
ADD COLUMN     "graph8ExtractSkillId" TEXT,
ADD COLUMN     "graph8PersonaId" TEXT,
ADD COLUMN     "graph8PipelineId" TEXT,
ADD COLUMN     "targetProfile" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "OperatorMap" ADD COLUMN     "clerkUserId" TEXT;

-- DropEnum
DROP TYPE "Hotness";

-- CreateIndex
CREATE UNIQUE INDEX "OperatorMap_clerkUserId_key" ON "OperatorMap"("clerkUserId");


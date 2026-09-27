-- AlterTable
ALTER TABLE "Capture" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "matchedTag" TEXT,
ADD COLUMN     "mediaDurationSec" DOUBLE PRECISION,
ADD COLUMN     "mediaMimeType" TEXT,
ADD COLUMN     "slackFileId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "workspace_id" TEXT;

-- AlterTable
ALTER TABLE "slack_connections" ADD COLUMN     "capture_tags" TEXT[] DEFAULT ARRAY['add-contact']::TEXT[];

-- CreateIndex
CREATE INDEX "Event_workspace_id_idx" ON "Event"("workspace_id");

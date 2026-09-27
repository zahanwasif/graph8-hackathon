-- AlterTable
ALTER TABLE "Event" ADD COLUMN "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "Event_workspaceId_idx" ON "Event"("workspaceId");

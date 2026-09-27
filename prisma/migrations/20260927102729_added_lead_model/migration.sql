-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "company" TEXT,
    "graph8ContactId" TEXT,
    "graph8ExecutionId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'PROCESSING',
    "fitScore" INTEGER,
    "disposition" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_eventId_idx" ON "Lead"("eventId");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_idx" ON "Lead"("workspaceId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

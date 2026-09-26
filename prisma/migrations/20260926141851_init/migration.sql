-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('VOICE', 'TEXT', 'IMAGE', 'LINK');

-- CreateEnum
CREATE TYPE "Hotness" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "CaptureStatus" AS ENUM ('RECEIVED', 'EXTRACTED', 'AWAITING_INFO', 'AWAITING_DISAMBIGUATION', 'RECORDED', 'AWAITING_APPROVAL', 'FOLLOWED_UP', 'FAILED');

-- CreateEnum
CREATE TYPE "ConvState" AS ENUM ('IDLE', 'AWAITING_INFO', 'AWAITING_DISAMBIGUATION', 'AWAITING_APPROVAL', 'AWAITING_EDIT');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "goal" TEXT,
    "slackChannelId" TEXT NOT NULL,
    "graph8ListId" TEXT,
    "graph8SequenceId" TEXT,
    "graph8HotWorkflowId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capture" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "slackThreadTs" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "slackEventId" TEXT NOT NULL,
    "inputType" "InputType" NOT NULL,
    "rawText" TEXT,
    "extraction" JSONB,
    "status" "CaptureStatus" NOT NULL DEFAULT 'RECEIVED',
    "hotness" "Hotness",
    "graph8ContactId" TEXT,
    "graph8CompanyId" TEXT,
    "graph8DealId" TEXT,
    "followUpSubject" TEXT,
    "followUpBody" TEXT,
    "followUpSentAt" TIMESTAMP(3),
    "linkedinInviteSentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadState" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "state" "ConvState" NOT NULL DEFAULT 'IDLE',
    "payload" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorMap" (
    "slackUserId" TEXT NOT NULL,
    "graph8UserId" TEXT,
    "displayName" TEXT,
    "signature" TEXT,

    CONSTRAINT "OperatorMap_pkey" PRIMARY KEY ("slackUserId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_slackChannelId_key" ON "Event"("slackChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "Capture_slackEventId_key" ON "Capture"("slackEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Capture_slackChannelId_slackThreadTs_key" ON "Capture"("slackChannelId", "slackThreadTs");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadState_captureId_key" ON "ThreadState"("captureId");

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadState" ADD CONSTRAINT "ThreadState_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "Capture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

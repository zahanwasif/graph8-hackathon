-- CreateTable
CREATE TABLE "slack_connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "bot_user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "granted_scopes" TEXT[],
    "channel_id" TEXT,
    "channel_name" TEXT,
    "connected_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_connections_workspace_id_key" ON "slack_connections"("workspace_id");

-- CreateIndex
CREATE INDEX "slack_connections_team_id_idx" ON "slack_connections"("team_id");

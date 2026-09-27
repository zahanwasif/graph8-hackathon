-- Two branches both added workspace scoping to "Event": "workspaceId" (20260926205836) and
-- "workspace_id" (20260927081326_slack_capture). Keep "workspaceId"; carry any values over first.
UPDATE "Event" SET "workspaceId" = COALESCE("workspaceId", "workspace_id");

DROP INDEX IF EXISTS "Event_workspace_id_idx";

ALTER TABLE "Event" DROP COLUMN IF EXISTS "workspace_id";

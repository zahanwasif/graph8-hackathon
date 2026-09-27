import { NextResponse } from 'next/server';

import { requireAdmin, requireWorkspace } from '@/server/auth';
import { getEventWorkflow, saveEventWorkflow, saveWorkflowSchema } from '@/server/events/workflow';
import { readJson, route } from '@/server/http';

/** `{ workflow }` — the event's graph8 intake workflow as an editable step list. */
export const GET = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/workflow'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const workflow = await getEventWorkflow(workspaceId, eventId);
    return NextResponse.json({ workflow });
  },
);

/** Save an edited step list back to graph8. Admin-only. `{ workflow, warnings }`. */
export const PUT = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/workflow'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireAdmin(workspaceId);
    const input = saveWorkflowSchema.parse(await readJson(request));
    const { graph, warnings } = await saveEventWorkflow(workspaceId, eventId, input);
    return NextResponse.json({ workflow: graph, warnings });
  },
);

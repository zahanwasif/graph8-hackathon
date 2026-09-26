import { NextResponse } from 'next/server';

import { requireAdmin, requireWorkspace } from '@/server/auth';
import { route } from '@/server/http';
import { disconnect, getConnection } from '@/server/slack/service';

/** `{ connection: null }` when the workspace has never connected Slack. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/integrations/slack'>) => {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json({ connection: await getConnection(workspaceId) });
  },
);

export const DELETE = route(
  async (_request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/integrations/slack'>) => {
    const { workspaceId } = await ctx.params;
    await requireAdmin(workspaceId);
    await disconnect(workspaceId);
    return new Response(null, { status: 204 });
  },
);

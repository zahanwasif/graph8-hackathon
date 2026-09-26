import { NextResponse } from 'next/server';

import { requireWorkspace } from '@/server/auth';
import { route } from '@/server/http';
import { listChannels } from '@/server/slack/service';

export const GET = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/integrations/slack/channels'>,
  ) => {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json(await listChannels(workspaceId));
  },
);

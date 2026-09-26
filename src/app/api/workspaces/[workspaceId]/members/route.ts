import { NextResponse } from 'next/server';

import { requireWorkspace } from '@/server/auth';
import { route } from '@/server/http';
import { listMembers } from '@/server/workspaces/service';

export const GET = route(
  async (_request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/members'>) => {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json(await listMembers(workspaceId));
  },
);

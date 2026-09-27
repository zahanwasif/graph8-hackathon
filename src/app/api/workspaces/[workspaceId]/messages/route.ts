import { NextResponse } from 'next/server';

import { requireWorkspace } from '@/server/auth';
import { route } from '@/server/http';
import { listMessages } from '@/server/messages/service';

/** Captured Slack messages (text and transcribed voice notes), newest first. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/messages'>) => {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json(await listMessages(workspaceId));
  },
);

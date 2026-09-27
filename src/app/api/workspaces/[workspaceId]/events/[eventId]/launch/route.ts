import { NextResponse } from 'next/server';

import { requireAdmin } from '@/server/auth';
import { launchEvent } from '@/server/events/service';
import { route } from '@/server/http';

/** Launch the event's graph8 campaign — starts real outreach. Admin-only. */
export const POST = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/launch'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireAdmin(workspaceId);
    const result = await launchEvent(workspaceId, eventId);
    return NextResponse.json(result);
  },
);

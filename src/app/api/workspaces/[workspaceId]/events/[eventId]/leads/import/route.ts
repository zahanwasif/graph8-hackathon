import { NextResponse } from 'next/server';

import { requireWorkspace } from '@/server/auth';
import { importCaptureLeads } from '@/server/capture/service';
import { route } from '@/server/http';

/** One sequential intake-workflow start per capture — give a backlog room to finish. */
export const maxDuration = 300;

/** Send the event's Slack captures that aren't leads yet through the graph8 intake workflow. */
export const POST = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/leads/import'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json(await importCaptureLeads(workspaceId, eventId));
  },
);

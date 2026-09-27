import { NextResponse } from 'next/server';

import { requireWorkspace } from '@/server/auth';
import { getEventSequences } from '@/server/events/workflow';
import { route } from '@/server/http';

/** `{ sequences }` — the org's sequences, for the sequencer step's picker. */
export const GET = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/workflow/sequences'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const sequences = await getEventSequences(workspaceId, eventId);
    return NextResponse.json({ sequences });
  },
);

import { NextResponse } from 'next/server';

import { requireAdmin, requireWorkspace } from '@/server/auth';
import { getWorkspaceEvent } from '@/server/capture/read';
import { deleteEvent } from '@/server/events/service';
import { notFound, route } from '@/server/http';

/** `{ event: EventWithCaptures }` — one event and its captures. */
export const GET = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const event = await getWorkspaceEvent(workspaceId, eventId);
    if (!event) throw notFound('Event not found');
    return NextResponse.json({ event });
  },
);

/** Delete an event and its captures. Admin-only. Responds 204 with no body. */
export const DELETE = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireAdmin(workspaceId);
    await deleteEvent(workspaceId, eventId);
    return new Response(null, { status: 204 });
  },
);

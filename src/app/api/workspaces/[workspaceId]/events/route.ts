import { NextResponse } from 'next/server';

import { requireWorkspace } from '@/server/auth';
import { listWorkspaceEvents } from '@/server/capture/read';
import { createEvent } from '@/server/events/service';
import { createEventSchema } from '@/server/events/schemas';
import { readJson, route } from '@/server/http';

/** `{ events: EventListItem[] }` — events in this workspace (plus unassigned), with capture counts. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/events'>) => {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json({ events: await listWorkspaceEvents(workspaceId) });
  },
);

/** Create a Debrief event (and provision it in graph8) for this workspace. */
export const POST = route(
  async (request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/events'>) => {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const input = createEventSchema.parse(await readJson(request));
    const event = await createEvent({ ...input, workspaceId });
    return NextResponse.json({ event }, { status: 201 });
  },
);

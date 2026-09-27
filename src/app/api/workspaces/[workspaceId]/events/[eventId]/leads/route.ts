import { NextResponse } from 'next/server';

import { requireWorkspace } from '@/server/auth';
import { listEventLeads } from '@/server/events/leads';
import { addLeadSchema } from '@/server/events/schemas';
import { addLeadToEvent } from '@/server/events/service';
import { readJson, route } from '@/server/http';

/** `{ leads: LeadListItem[] }` — contacts read straight from the event's graph8 list. */
export const GET = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/leads'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json({ leads: await listEventLeads(workspaceId, eventId) });
  },
);

/** Add a lead to an event by running its graph8 intake workflow (create → enrich → score → list). */
export const POST = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/leads'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const lead = addLeadSchema.parse(await readJson(request));
    const result = await addLeadToEvent(workspaceId, eventId, lead);
    return NextResponse.json(result);
  },
);

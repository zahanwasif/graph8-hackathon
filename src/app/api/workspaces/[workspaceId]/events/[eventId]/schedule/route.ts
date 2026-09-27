import { NextResponse } from 'next/server';

import { requireAdmin, requireWorkspace } from '@/server/auth';
import { setEventScheduleSchema } from '@/server/events/schemas';
import { getEventScheduleOptions, setEventSchedule } from '@/server/events/service';
import { readJson, route } from '@/server/http';

/** `{ schedules, selectedId }` — the org's sending-window schedules and this event's current pick. */
export const GET = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/schedule'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json(await getEventScheduleOptions(workspaceId, eventId));
  },
);

/**
 * Set the event's sending-window schedule and sync it to the graph8 sequencer. Admin-only —
 * it changes when real outreach sends and PATCHes the live sequence.
 */
export const PUT = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/schedule'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireAdmin(workspaceId);
    const { scheduleId } = setEventScheduleSchema.parse(await readJson(request));
    const result = await setEventSchedule(workspaceId, eventId, scheduleId);
    return NextResponse.json(result);
  },
);

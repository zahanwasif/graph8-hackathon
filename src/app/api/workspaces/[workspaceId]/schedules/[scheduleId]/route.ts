import { NextResponse } from 'next/server';

import { requireAdmin } from '@/server/auth';
import { updateScheduleSchema } from '@/server/events/schemas';
import { updateOrgSchedule } from '@/server/events/service';
import { readJson, route } from '@/server/http';

/** Update a sending-window schedule in graph8. Admin-only. */
export const PATCH = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/schedules/[scheduleId]'>,
  ) => {
    const { workspaceId, scheduleId } = await ctx.params;
    await requireAdmin(workspaceId);
    const input = updateScheduleSchema.parse(await readJson(request));
    await updateOrgSchedule(scheduleId, input);
    return NextResponse.json({ ok: true });
  },
);

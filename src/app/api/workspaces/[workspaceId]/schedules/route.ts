import { NextResponse } from 'next/server';

import { requireAdmin } from '@/server/auth';
import { createScheduleSchema } from '@/server/events/schemas';
import { createOrgSchedule } from '@/server/events/service';
import { readJson, route } from '@/server/http';

/**
 * Create a sending-window schedule in graph8 (the Schedule tab editor). Admin-only — schedules are
 * org-wide and govern when real outreach sends. Returns `{ id }` of the new schedule.
 */
export const POST = route(
  async (request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/schedules'>) => {
    const { workspaceId } = await ctx.params;
    await requireAdmin(workspaceId);
    const input = createScheduleSchema.parse(await readJson(request));
    const result = await createOrgSchedule(input);
    return NextResponse.json(result, { status: 201 });
  },
);

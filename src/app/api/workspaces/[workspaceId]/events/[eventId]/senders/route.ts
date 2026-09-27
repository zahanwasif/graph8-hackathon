import { NextResponse } from 'next/server';

import { requireAdmin } from '@/server/auth';
import { setEventSendersSchema } from '@/server/events/schemas';
import { setEventSenders } from '@/server/events/service';
import { readJson, route } from '@/server/http';

/**
 * Set which connected mailboxes this event's sequence sends from. Admin-only. The selection is
 * attached as the sequence's email channels the next time the workflow is published.
 */
export const PUT = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/senders'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireAdmin(workspaceId);
    const { mailboxIds } = setEventSendersSchema.parse(await readJson(request));
    const result = await setEventSenders(workspaceId, eventId, mailboxIds);
    return NextResponse.json(result);
  },
);

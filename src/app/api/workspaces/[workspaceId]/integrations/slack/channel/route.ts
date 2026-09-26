import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/server/auth';
import { readJson, route } from '@/server/http';
import { setChannel } from '@/server/slack/service';

const bodySchema = z.object({ channelId: z.string().trim().min(1, 'Choose a channel') });

export const PUT = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/integrations/slack/channel'>,
  ) => {
    const { workspaceId } = await ctx.params;
    await requireAdmin(workspaceId);
    const { channelId } = bodySchema.parse(await readJson(request));
    return NextResponse.json({ connection: await setChannel(workspaceId, channelId) });
  },
);

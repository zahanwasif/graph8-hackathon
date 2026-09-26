import { NextResponse } from 'next/server';

import { requireAdmin } from '@/server/auth';
import { route } from '@/server/http';
import { buildAuthorizeUrl, getSlackConfig } from '@/server/slack/oauth';

/**
 * Mints the Slack install URL. POST, not GET: it signs a short-lived `state`, so it is not a
 * cacheable read. The client then navigates the top-level window to it.
 */
export const POST = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/integrations/slack/authorize-url'>,
  ) => {
    const { workspaceId } = await ctx.params;
    const { userId } = await requireAdmin(workspaceId);
    const config = getSlackConfig(new URL(request.url).origin);
    return NextResponse.json({ url: buildAuthorizeUrl(config, { workspaceId, userId }) });
  },
);

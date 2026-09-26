import { clerkClient } from '@clerk/nextjs/server';

import { requireWorkspace } from '@/server/auth';
import { route } from '@/server/http';
import { postMessage } from '@/server/slack/service';

/** Posts a hello to the chosen channel, so whoever set it up can see it land. */
export const POST = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/integrations/slack/test'>,
  ) => {
    const { workspaceId } = await ctx.params;
    const { userId } = await requireWorkspace(workspaceId);

    const clerk = await clerkClient();
    const [user, org] = await Promise.all([
      clerk.users.getUser(userId),
      clerk.organizations.getOrganization({ organizationId: workspaceId }),
    ]);
    const who = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Someone';

    await postMessage(
      workspaceId,
      `:wave: ${who} sent a test message from the *${org.name}* workspace. Slack is connected.`,
    );
    return new Response(null, { status: 204 });
  },
);

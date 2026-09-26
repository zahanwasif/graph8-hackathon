import { requireAdmin } from '@/server/auth';
import { route } from '@/server/http';
import { removeMember } from '@/server/workspaces/service';

export const DELETE = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/members/[userId]'>,
  ) => {
    const { workspaceId, userId } = await ctx.params;
    const { userId: requestingUserId } = await requireAdmin(workspaceId);
    await removeMember(workspaceId, userId, requestingUserId);
    return new Response(null, { status: 204 });
  },
);

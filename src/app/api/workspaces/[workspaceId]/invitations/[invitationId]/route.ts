import { requireAdmin } from '@/server/auth';
import { route } from '@/server/http';
import { revokeInvitation } from '@/server/workspaces/service';

export const DELETE = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/invitations/[invitationId]'>,
  ) => {
    const { workspaceId, invitationId } = await ctx.params;
    const { userId } = await requireAdmin(workspaceId);
    await revokeInvitation(workspaceId, invitationId, userId);
    return new Response(null, { status: 204 });
  },
);

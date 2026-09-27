import { requireAdmin } from '@/server/auth';
import { disconnectMailbox } from '@/server/mailboxes/service';
import { route } from '@/server/http';

/** Disconnect a sending mailbox from graph8. Admin-only. Responds 204 with no body. */
export const DELETE = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/mailboxes/[mailboxId]'>,
  ) => {
    const { workspaceId, mailboxId } = await ctx.params;
    await requireAdmin(workspaceId);
    await disconnectMailbox(mailboxId);
    return new Response(null, { status: 204 });
  },
);

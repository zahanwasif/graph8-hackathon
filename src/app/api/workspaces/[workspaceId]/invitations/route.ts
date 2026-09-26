import { NextResponse } from 'next/server';

import { requireAdmin, requireWorkspace } from '@/server/auth';
import { readJson, route } from '@/server/http';
import { inviteMemberSchema } from '@/server/workspaces/schemas';
import { inviteMember, listInvitations } from '@/server/workspaces/service';

export const GET = route(
  async (_request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/invitations'>) => {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json(await listInvitations(workspaceId));
  },
);

export const POST = route(
  async (request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/invitations'>) => {
    const { workspaceId } = await ctx.params;
    const { userId } = await requireAdmin(workspaceId);
    const input = inviteMemberSchema.parse(await readJson(request));
    return NextResponse.json(await inviteMember(workspaceId, userId, input), { status: 201 });
  },
);

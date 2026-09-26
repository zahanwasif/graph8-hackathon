import { NextResponse } from 'next/server';

import { requireAdmin } from '@/server/auth';
import { readJson, route } from '@/server/http';
import { workspaceNameSchema } from '@/server/workspaces/schemas';
import { renameWorkspace } from '@/server/workspaces/service';

export const PATCH = route(
  async (request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]'>) => {
    const { workspaceId } = await ctx.params;
    await requireAdmin(workspaceId);
    const { name } = workspaceNameSchema.parse(await readJson(request));
    return NextResponse.json(await renameWorkspace(workspaceId, name));
  },
);

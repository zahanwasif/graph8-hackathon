import { NextResponse } from 'next/server';

import { requireUser } from '@/server/auth';
import { readJson, route } from '@/server/http';
import { workspaceNameSchema } from '@/server/workspaces/schemas';
import { createWorkspace } from '@/server/workspaces/service';

/** Creates a workspace with the caller as admin. The client then makes it active via `setActive`. */
export const POST = route(async (request: Request) => {
  const userId = await requireUser();
  const { name } = workspaceNameSchema.parse(await readJson(request));
  return NextResponse.json(await createWorkspace(userId, name), { status: 201 });
});

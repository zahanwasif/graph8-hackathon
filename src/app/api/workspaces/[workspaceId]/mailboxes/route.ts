import { NextResponse } from 'next/server';

import { requireAdmin, requireWorkspace } from '@/server/auth';
import { connectMailboxSchema } from '@/server/mailboxes/schemas';
import { connectMailbox, listWorkspaceMailboxes } from '@/server/mailboxes/service';
import { readJson, route } from '@/server/http';

/** `{ mailboxes: MailboxSummary[] }` — the graph8 org's connected sending mailboxes. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/mailboxes'>) => {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json({ mailboxes: await listWorkspaceMailboxes() });
  },
);

/** Connect an SMTP/IMAP sending mailbox in graph8. Admin-only — it writes shared graph8 config. */
export const POST = route(
  async (request: Request, ctx: RouteContext<'/api/workspaces/[workspaceId]/mailboxes'>) => {
    const { workspaceId } = await ctx.params;
    await requireAdmin(workspaceId);
    const input = connectMailboxSchema.parse(await readJson(request));
    const result = await connectMailbox(input);
    return NextResponse.json(result, { status: 201 });
  },
);

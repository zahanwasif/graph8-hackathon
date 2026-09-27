import { clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { requireAdmin, requireWorkspace } from '@/server/auth';
import { publishSequenceSchema } from '@/server/events/schemas';
import { getEventSequence, publishEventSequence } from '@/server/events/service';
import { badRequest, readJson, route } from '@/server/http';

/**
 * `{ sequence: SequenceProgress | null }` — the event's published sequence status, steps, and
 * per-contact progress. Null until a workflow is published. Powers the Live badge + lead progress.
 */
export const GET = route(
  async (
    _request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/sequence'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return NextResponse.json({ sequence: await getEventSequence(workspaceId, eventId) });
  },
);

/**
 * Publish the workflow builder's cadence as a real (drafted) graph8 sequence. Admin-only:
 * it writes a shared graph8 record. The signed-in admin is the sequence owner (`user_email`),
 * so we resolve their email from Clerk here — the request-context concern belongs at the edge.
 */
export const POST = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/events/[eventId]/sequence'>,
  ) => {
    const { workspaceId, eventId } = await ctx.params;
    const { userId } = await requireAdmin(workspaceId);

    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const ownerEmail =
      user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    if (!ownerEmail) {
      throw badRequest('Your account has no email address for graph8 to own the sequence.');
    }

    const input = publishSequenceSchema.parse(await readJson(request));
    const result = await publishEventSequence(workspaceId, eventId, ownerEmail, input);
    return NextResponse.json(result);
  },
);

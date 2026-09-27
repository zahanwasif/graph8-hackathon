import 'server-only';

import { db } from '@/server/db';
import type { CapturedMessage } from '@/lib/types/message';

/** How many captures the Messages view loads. Paging comes later if anyone gets near it. */
const LIST_LIMIT = 100;

/**
 * The workspace's captured Slack messages, newest first. Captures are scoped through their
 * `Event` (one per Slack channel), which carries the workspace id.
 */
export async function listMessages(workspaceId: string): Promise<CapturedMessage[]> {
  const captures = await db().capture.findMany({
    where: { event: { workspaceId } },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    include: { event: { select: { name: true } } },
  });

  const userIds = [...new Set(captures.map((c) => c.slackUserId))];
  const operators = await db().operatorMap.findMany({
    where: { slackUserId: { in: userIds } },
    select: { slackUserId: true, displayName: true },
  });
  const names = new Map(operators.map((o) => [o.slackUserId, o.displayName]));

  return captures.map((capture) => ({
    id: capture.id,
    inputType: capture.inputType,
    content: capture.rawText ?? '',
    caption: capture.caption,
    matchedTag: capture.matchedTag,
    slackUserId: capture.slackUserId,
    authorName: names.get(capture.slackUserId) ?? null,
    channelName: capture.event.name,
    status: capture.status,
    mediaDurationSec: capture.mediaDurationSec,
    contact: {
      email: capture.personEmail,
      firstName: capture.personFirstName,
      lastName: capture.personLastName,
      jobTitle: capture.personTitle,
      company: capture.personCompany,
    },
    createdAt: capture.createdAt.toISOString(),
  }));
}

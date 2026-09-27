import 'server-only';

import { createHmac } from 'node:crypto';

import { db } from '@/server/db';
import { safeEqual } from '@/server/crypto/secret-box';

/**
 * Slack Events API: Slack POSTs every subscribed event to `/api/integrations/slack/events`.
 * https://api.slack.com/apis/events-api
 */

/** Slack refuses to deliver to an endpoint that takes longer than this; reject older replays too. */
const MAX_SIGNATURE_AGE_SECONDS = 60 * 5;

/**
 * Verifies `X-Slack-Signature`: `v0=` + HMAC-SHA256(signing secret, `v0:<timestamp>:<raw body>`).
 * Must run on the raw body — re-serialising parsed JSON changes the bytes and breaks the HMAC.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) throw new Error('SLACK_SIGNING_SECRET is not set');
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SECONDS) return false;

  const expected =
    'v0=' + createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
  return safeEqual(signature, expected);
}

/** The subset of a `message` event we read. Subtypes cover edits, joins, bot posts, etc. */
export interface SlackMessageEvent {
  type: 'message';
  subtype?: string;
  channel: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
}

/** The outer envelope Slack wraps every event in. */
export interface SlackEventEnvelope {
  type: 'event_callback';
  team_id: string;
  event_id: string;
  event_time: number;
  event: { type: string } & Partial<SlackMessageEvent>;
}

/**
 * Handles a message posted in a Slack channel.
 *
 * Only messages in a channel some workspace has connected are captured — the bot may sit in
 * other channels too, and those aren't ours to record. For now "capture" means log it.
 */
export async function handleMessageEvent(teamId: string, event: SlackMessageEvent): Promise<void> {
  const connection = await db().slackConnection.findFirst({
    where: { teamId, channelId: event.channel },
    select: { workspaceId: true, channelName: true, botUserId: true },
  });
  if (!connection) return;

  // Our own test messages (and any other bot post) come back as events too.
  const fromBot = Boolean(event.bot_id) || event.user === connection.botUserId;

  console.log('[slack] message received', {
    workspaceId: connection.workspaceId,
    channel: `#${connection.channelName ?? event.channel}`,
    user: event.user ?? null,
    fromBot,
    subtype: event.subtype ?? null,
    text: event.text ?? '',
    ts: event.ts,
    threadTs: event.thread_ts ?? null,
  });
}

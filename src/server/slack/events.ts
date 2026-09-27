import 'server-only';

import { createHmac } from 'node:crypto';
import type { SlackConnection as SlackConnectionRow } from '@prisma/client';

import { db } from '@/server/db';
import { decryptSecret, safeEqual } from '@/server/crypto/secret-box';
import { clientFor } from '@/server/slack/service';
import { matchSpokenTag, matchTextTag } from '@/server/slack/tags';
import { transcribe } from '@/server/transcription/deepgram';

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

/** A file attached to a message. Slack voice/video clips arrive as `audio/*` or `video/*`. */
export interface SlackFile {
  id: string;
  name?: string;
  mimetype?: string;
  url_private_download?: string;
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
  files?: SlackFile[];
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
 * Message subtypes that are a person posting something. Everything else — edits
 * (`message_changed`), deletions, joins, topic changes — is not new content to capture.
 */
const CAPTURABLE_SUBTYPES = new Set([undefined, 'file_share', 'thread_broadcast']);

const isMedia = (file: SlackFile) =>
  Boolean(file.mimetype?.startsWith('audio/') || file.mimetype?.startsWith('video/'));

interface TranscribedFile {
  file: SlackFile;
  transcript: string;
  durationSec: number | null;
}

/**
 * Downloads a Slack file with the bot token. Without `files:read` Slack answers with its HTML
 * sign-in page rather than an error status, so check the content type too.
 */
async function downloadSlackFile(file: SlackFile, accessToken: string): Promise<ArrayBuffer> {
  if (!file.url_private_download) throw new Error(`Slack file ${file.id} has no download URL yet`);

  const response = await fetch(file.url_private_download, {
    headers: { Authorization: `Bearer ${decryptSecret(accessToken, process.env.CREDENTIALS_ENCRYPTION_KEY)}` },
  });
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(
      `Could not download Slack file ${file.id} (${response.status}). Is the files:read scope granted? Reconnect Slack.`,
    );
  }
  return response.arrayBuffer();
}

async function transcribeFiles(
  files: SlackFile[],
  connection: SlackConnectionRow,
): Promise<TranscribedFile[]> {
  const results: TranscribedFile[] = [];
  for (const file of files) {
    const audio = await downloadSlackFile(file, connection.accessToken);
    const { transcript, durationSec } = await transcribe(audio, file.mimetype!);
    results.push({ file, transcript, durationSec });
  }
  return results;
}

/** Best-effort display name for the Messages view, cached on `OperatorMap`. */
async function rememberSlackUser(connection: SlackConnectionRow, slackUserId: string) {
  try {
    const { user } = await clientFor(connection).users.info({ user: slackUserId });
    const displayName =
      user?.profile?.display_name || user?.profile?.real_name || user?.real_name || user?.name;
    if (!displayName) return;
    await db().operatorMap.upsert({
      where: { slackUserId },
      create: { slackUserId, displayName },
      update: { displayName },
    });
  } catch (error) {
    // Missing `users:read` or a transient Slack error — the view falls back to the user id.
    console.warn('[slack] could not look up user', slackUserId, (error as Error).message);
  }
}

/**
 * Handles a message posted in a Slack channel: captures it when it carries one of the
 * workspace's hashtags (`SlackConnection.captureTags`).
 *
 * - Text: the tag must be written in the message (`#add-contact`).
 * - Voice/video notes: every audio/video file is transcribed with Deepgram into one string, and
 *   the note is captured when the typed caption has the tag *or* the transcript says it
 *   ("hashtag add contact").
 *
 * A capture is one Slack thread (`Capture`, unique on channel + thread). A second tagged message
 * in the same thread is appended to it. Only the workspace's connected channel is watched.
 */
export async function handleMessageEvent(
  teamId: string,
  eventId: string,
  event: SlackMessageEvent,
): Promise<void> {
  if (!CAPTURABLE_SUBTYPES.has(event.subtype) || event.bot_id || !event.user) return;

  const connection = await db().slackConnection.findFirst({
    where: { teamId, channelId: event.channel },
  });
  if (!connection || event.user === connection.botUserId) return;

  // Slack retries are acked without reprocessing in the route; this guards the rest.
  if (await db().capture.findUnique({ where: { slackEventId: eventId }, select: { id: true } })) {
    return;
  }

  const tags = connection.captureTags;
  const media = (event.files ?? []).filter(isMedia);
  const caption = event.text?.trim() || null;

  let matchedTag: string | null;
  let content: string;
  let transcribed: TranscribedFile[] = [];

  if (media.length > 0) {
    transcribed = await transcribeFiles(media, connection);
    const transcript = transcribed.map((t) => t.transcript).filter(Boolean).join('\n\n');
    matchedTag = matchTextTag(caption ?? undefined, tags) ?? matchSpokenTag(transcript, tags);
    content = transcript;
  } else {
    matchedTag = matchTextTag(event.text, tags);
    content = event.text ?? '';
  }

  const channel = `#${connection.channelName ?? event.channel}`;
  if (!matchedTag) {
    console.log('[slack] message ignored (no capture tag)', {
      channel,
      kind: media.length ? 'voice' : 'text',
      tags,
      ...(media.length ? { transcript: content } : {}),
    });
    return;
  }

  const threadTs = event.thread_ts ?? event.ts;
  const inputType = media.length ? 'VOICE' : 'TEXT';
  const durations = transcribed.map((t) => t.durationSec).filter((d): d is number => d !== null);

  await rememberSlackUser(connection, event.user);

  const captureEvent = await db().event.upsert({
    where: { slackChannelId: event.channel },
    create: { name: channel, slackChannelId: event.channel, workspaceId: connection.workspaceId },
    update: { workspaceId: connection.workspaceId },
    select: { id: true },
  });

  const existing = await db().capture.findUnique({
    where: { slackChannelId_slackThreadTs: { slackChannelId: event.channel, slackThreadTs: threadTs } },
    select: { id: true, rawText: true },
  });

  if (existing) {
    await db().capture.update({
      where: { id: existing.id },
      data: { rawText: [existing.rawText, content].filter(Boolean).join('\n\n') },
    });
  } else {
    await db().capture.create({
      data: {
        eventId: captureEvent.id,
        slackChannelId: event.channel,
        slackThreadTs: threadTs,
        slackUserId: event.user,
        slackEventId: eventId,
        inputType,
        rawText: content,
        caption: media.length ? caption : null,
        matchedTag,
        slackFileId: transcribed[0]?.file.id ?? null,
        mediaMimeType: transcribed[0]?.file.mimetype ?? null,
        mediaDurationSec: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
      },
    });
  }

  console.log(`[slack] message captured (${existing ? 'appended to thread' : 'new'})`, {
    workspaceId: connection.workspaceId,
    channel,
    user: event.user,
    kind: inputType.toLowerCase(),
    tag: matchedTag,
    text: content,
  });
}

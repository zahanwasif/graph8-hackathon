import 'server-only';

import { createHmac } from 'node:crypto';

import { safeEqual } from '@/server/crypto/secret-box';

/**
 * Slack Events API: shared types and request verification. Slack POSTs every subscribed event to
 * `/api/slack/events` (also reachable as `/api/integrations/slack/events`); the capture pipeline
 * that handles them is `src/server/capture/service.ts`.
 * https://api.slack.com/apis/events-api
 */

/** Reject requests older than this — Slack's replay-protection guidance. */
const MAX_SIGNATURE_AGE_SECONDS = 60 * 5;

/**
 * Verifies `X-Slack-Signature`: `v0=` + HMAC-SHA256(signing secret, `v0:<timestamp>:<raw body>`).
 * Must run on the raw body — re-serialising parsed JSON changes the bytes and breaks the HMAC.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
}): boolean {
  const { rawBody, timestamp, signature, signingSecret } = input;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SECONDS) return false;

  const expected =
    'v0=' + createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
  return safeEqual(signature, expected);
}

/** A file attached to a message. Slack voice/video clips arrive as `audio/*` / `video/*`. */
export interface SlackFile {
  id: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
  url_private_download?: string;
}

/** The subset of a `message` event we read. Subtypes cover edits, joins, bot posts, etc. */
export interface SlackMessageEvent {
  type: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: SlackFile[];
}

/**
 * The body Slack POSTs: either the one-off `url_verification` handshake or an `event_callback`
 * wrapping one event. Kept as one loose shape (rather than a union) because handlers check the
 * fields they need at runtime anyway — Slack adds fields and event types freely.
 */
export interface SlackEventEnvelope {
  type: 'url_verification' | 'event_callback' | (string & {});
  /** Only on `url_verification`. */
  challenge?: string;
  team_id?: string;
  event_id?: string;
  event_time?: number;
  event?: SlackMessageEvent;
}

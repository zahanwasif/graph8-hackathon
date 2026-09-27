import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { safeEqual } from '@/server/crypto/secret-box';
import { HttpError } from '@/server/http';

export const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';

/**
 * Bot scopes requested on install.
 * - `chat:write` / `chat:write.public`: post to the chosen channel (public ones without joining).
 * - `channels:read` / `groups:read`: list channels for the picker (private: only ones the bot is in).
 * - `channels:join`: join the chosen public channel so it shows up as a member there.
 * - `channels:history` / `groups:history`: receive `message.channels` / `message.groups` events
 *   for channels the bot is in (see `src/server/slack/events.ts`).
 * - `files:read`: download voice/video notes to transcribe them.
 * - `users:read`: show who posted a captured message.
 *
 * Adding a scope here only affects new installs — existing workspaces must reconnect to grant it.
 */
export const SLACK_BOT_SCOPES = [
  'chat:write',
  'chat:write.public',
  'channels:read',
  'groups:read',
  'channels:join',
  'channels:history',
  'groups:history',
  'files:read',
  'users:read',
] as const;

/** How long an install link stays valid. Long enough to read Slack's consent screen. */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface SlackConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * The app's public base URL: `NEXT_PUBLIC_APP_URL` when set, else the request origin.
 *
 * Prefer the env var. Behind a tunnel (ngrok) or proxy the request origin is whatever the dev
 * server thinks it is — e.g. `localhost:3000` — not the address the browser is on. The fallback
 * keeps Vercel previews working, provided that preview URL is registered in the Slack app too.
 */
export function appBaseUrl(requestOrigin: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || requestOrigin).replace(/\/$/, '');
}

/** Slack matches `redirect_uri` exactly against the app's configured list. */
export function getSlackConfig(requestOrigin: string): SlackConfig {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new HttpError(503, 'Slack is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.');
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${appBaseUrl(requestOrigin)}/api/integrations/slack/callback`,
  };
}

export interface SlackState {
  workspaceId: string;
  userId: string;
}

/**
 * Signs the OAuth `state`: HMAC-SHA256 over `workspaceId.userId.nonce.expiresAt`, keyed with the
 * client secret. The callback has no request body of its own to
 * trust, so this is what tells it which workspace — and which admin — started the install.
 */
export function signState(state: SlackState, clientSecret: string): string {
  const nonce = randomBytes(16).toString('base64url');
  const expiresAt = Date.now() + STATE_TTL_MS;

  const payload = `${state.workspaceId}.${state.userId}.${nonce}.${expiresAt}`;
  const signature = createHmac('sha256', clientSecret).update(payload).digest('base64url');

  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

/** Returns the signed workspace and user, or `null` for a forged, malformed or expired state. */
export function verifyState(state: string | null, clientSecret: string): SlackState | null {
  if (!state) return null;

  const separator = state.lastIndexOf('.');
  if (separator <= 0) return null;

  const encodedPayload = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');

  const expected = createHmac('sha256', clientSecret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;

  const parts = payload.split('.');
  if (parts.length !== 4) return null;

  const [workspaceId, userId, , expiresAtRaw] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  if (!workspaceId || !userId) return null;

  return { workspaceId, userId };
}

export function buildAuthorizeUrl(config: SlackConfig, state: SlackState): string {
  const query = new URLSearchParams({
    client_id: config.clientId,
    scope: SLACK_BOT_SCOPES.join(','),
    redirect_uri: config.redirectUri,
    state: signState(state, config.clientSecret),
  });
  return `${SLACK_AUTHORIZE_URL}?${query.toString()}`;
}

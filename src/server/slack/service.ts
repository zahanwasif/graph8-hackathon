import 'server-only';

import { WebClient } from '@slack/web-api';
import type { SlackConnection as SlackConnectionRow } from '@prisma/client';

import { db } from '@/server/db';
import { decryptSecret, encryptSecret } from '@/server/crypto/secret-box';
import { badGateway, badRequest, HttpError, notFound } from '@/server/http';
import type { SlackChannel, SlackConnection } from '@/lib/types/slack';

/** Stop paging channels here so a huge Slack org can't stall a request. */
const MAX_CHANNELS = 1000;

/** Slack error codes that mean the stored token is dead and the workspace must reconnect. */
const REVOKED_ERRORS = new Set(['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed']);

const key = () => process.env.CREDENTIALS_ENCRYPTION_KEY;

/** The client-safe view of a connection. The token never leaves the server. */
function toConnection(row: SlackConnectionRow): SlackConnection {
  return {
    id: row.id,
    teamId: row.teamId,
    teamName: row.teamName,
    botUserId: row.botUserId,
    grantedScopes: row.grantedScopes,
    channelId: row.channelId,
    channelName: row.channelName,
    connectedByUserId: row.connectedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Maps a `@slack/web-api` failure onto an HTTP error the dashboard can show. */
function toSlackHttpError(action: string, error: unknown): HttpError {
  const code = (error as { data?: { error?: string } })?.data?.error;
  if (code && REVOKED_ERRORS.has(code)) {
    return new HttpError(409, 'The Slack connection was revoked. Disconnect and connect again.');
  }
  if (code === 'not_in_channel' || code === 'channel_not_found') {
    return badRequest(
      'The bot is not in that channel. In Slack, run /invite @your-bot in the channel, then retry.',
    );
  }
  console.error(`Slack ${action} failed`, code ?? error);
  return badGateway(`Slack could not ${action}${code ? ` (${code})` : ''}`);
}

async function getRow(workspaceId: string): Promise<SlackConnectionRow> {
  const row = await db().slackConnection.findUnique({ where: { workspaceId } });
  if (!row) throw notFound('Slack is not connected to this workspace');
  return row;
}

function clientFor(row: SlackConnectionRow): WebClient {
  return new WebClient(decryptSecret(row.accessToken, key()));
}

export async function getConnection(workspaceId: string): Promise<SlackConnection | null> {
  const row = await db().slackConnection.findUnique({ where: { workspaceId } });
  return row ? toConnection(row) : null;
}

/** Exchanges the OAuth code for a bot token and stores it (encrypted) against the workspace. */
export async function completeInstall(input: {
  workspaceId: string;
  userId: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<void> {
  const result = await new WebClient().oauth.v2.access({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });

  if (!result.ok || !result.access_token || !result.team?.id || !result.bot_user_id) {
    throw badGateway('Slack did not return a bot token');
  }

  const data = {
    teamId: result.team.id,
    teamName: result.team.name ?? result.team.id,
    botUserId: result.bot_user_id,
    accessToken: encryptSecret(result.access_token, key()),
    grantedScopes: (result.scope ?? '').split(',').filter(Boolean),
    connectedByUserId: input.userId,
  };

  // Reinstalling into a different Slack team invalidates the old channel choice; reinstalling
  // into the same team (e.g. to pick up a new scope) keeps it.
  const existing = await db().slackConnection.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { teamId: true },
  });
  const channelReset =
    existing && existing.teamId !== data.teamId ? { channelId: null, channelName: null } : {};

  await db().slackConnection.upsert({
    where: { workspaceId: input.workspaceId },
    create: { workspaceId: input.workspaceId, ...data },
    update: { ...data, ...channelReset },
  });
}

/** Public channels, plus private ones the bot has been invited to, alphabetically. */
export async function listChannels(workspaceId: string): Promise<SlackChannel[]> {
  const client = clientFor(await getRow(workspaceId));
  const channels: SlackChannel[] = [];

  let cursor: string | undefined;
  try {
    do {
      const page = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200,
        cursor,
      });
      for (const channel of page.channels ?? []) {
        if (!channel.id || !channel.name) continue;
        channels.push({
          id: channel.id,
          name: channel.name,
          isPrivate: Boolean(channel.is_private),
          isMember: Boolean(channel.is_member),
        });
      }
      cursor = page.response_metadata?.next_cursor || undefined;
    } while (cursor && channels.length < MAX_CHANNELS);
  } catch (error) {
    throw toSlackHttpError('list channels', error);
  }

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Chooses the channel the workspace posts to. The bot joins public channels itself; a private
 * channel has to invite it, which is why the picker only offers private channels it is in.
 */
export async function setChannel(workspaceId: string, channelId: string): Promise<SlackConnection> {
  const row = await getRow(workspaceId);
  const client = clientFor(row);

  let channelName: string;
  try {
    const { channel } = await client.conversations.info({ channel: channelId });
    if (!channel?.id || !channel.name) throw notFound('Slack channel not found');
    if (channel.is_archived) throw badRequest('That channel is archived');

    if (!channel.is_member) {
      if (channel.is_private) {
        throw badRequest('Invite the bot to that private channel in Slack first (/invite @your-bot).');
      }
      await client.conversations.join({ channel: channel.id });
    }
    channelName = channel.name;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw toSlackHttpError('select that channel', error);
  }

  const updated = await db().slackConnection.update({
    where: { workspaceId },
    data: { channelId, channelName },
  });
  return toConnection(updated);
}

/** Posts a message to the workspace's chosen channel. */
export async function postMessage(workspaceId: string, text: string): Promise<void> {
  const row = await getRow(workspaceId);
  if (!row.channelId) throw badRequest('Choose a Slack channel first');

  try {
    await clientFor(row).chat.postMessage({ channel: row.channelId, text });
  } catch (error) {
    throw toSlackHttpError('post the message', error);
  }
}

/**
 * Revokes the bot token at Slack (best effort — it may already be dead) and forgets the
 * connection. The Slack app itself stays installed until a Slack admin removes it.
 */
export async function disconnect(workspaceId: string): Promise<void> {
  const row = await db().slackConnection.findUnique({ where: { workspaceId } });
  if (!row) return;

  try {
    await clientFor(row).auth.revoke();
  } catch (error) {
    console.warn('Slack token revoke failed; deleting the connection anyway', error);
  }
  await db().slackConnection.delete({ where: { workspaceId } });
}

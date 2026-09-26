import { apiFetch } from '@/lib/api';
import type { SlackChannel, SlackConnection } from '@/lib/types/slack';

function slackPath(workspaceId: string, suffix = '') {
  return `/workspaces/${workspaceId}/integrations/slack${suffix}`;
}

/** Resolves to `null` when the workspace has never connected. The API wraps it in an envelope. */
export async function getSlackConnection(workspaceId: string): Promise<SlackConnection | null> {
  const { connection } = await apiFetch<{ connection: SlackConnection | null }>(
    slackPath(workspaceId),
  );
  return connection;
}

/**
 * Mints the Slack install URL. POST, not GET: it signs a short-lived `state`, so it is not a
 * cacheable read.
 */
export function createSlackAuthorizeUrl(workspaceId: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(slackPath(workspaceId, '/authorize-url'), { method: 'POST' });
}

export function listSlackChannels(workspaceId: string): Promise<SlackChannel[]> {
  return apiFetch<SlackChannel[]>(slackPath(workspaceId, '/channels'));
}

export async function setSlackChannel(
  workspaceId: string,
  channelId: string,
): Promise<SlackConnection> {
  const { connection } = await apiFetch<{ connection: SlackConnection }>(
    slackPath(workspaceId, '/channel'),
    { method: 'PUT', body: JSON.stringify({ channelId }) },
  );
  return connection;
}

export function sendSlackTestMessage(workspaceId: string): Promise<void> {
  return apiFetch<void>(slackPath(workspaceId, '/test'), { method: 'POST' });
}

export function disconnectSlack(workspaceId: string): Promise<void> {
  return apiFetch<void>(slackPath(workspaceId), { method: 'DELETE' });
}

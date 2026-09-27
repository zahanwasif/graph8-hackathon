'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';

import {
  createSlackAuthorizeUrl,
  disconnectSlack,
  getSlackConnection,
  listSlackChannels,
  sendSlackTestMessage,
  setSlackCaptureTags,
  setSlackChannel,
} from '@/lib/integrations/slack';
import type { SlackChannel, SlackConnection } from '@/lib/types/slack';

// ============ Query Keys ============
export const slackKeys = {
  all: ['integrations', 'slack'] as const,
  connection: (workspaceId: string) => [...slackKeys.all, 'connection', workspaceId] as const,
  channels: (workspaceId: string) => [...slackKeys.all, 'channels', workspaceId] as const,
};

// ============ Queries ============

/** The workspace's Slack connection, or `null` when it has never connected. */
export function useSlackConnection() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: slackKeys.connection(workspaceId!),
    queryFn: (): Promise<SlackConnection | null> => getSlackConnection(workspaceId!),
    enabled: isOrgLoaded && !!workspaceId,
  });
}

/** Channels the picker can offer. Only fetched while the picker is open (`enabled`). */
export function useSlackChannels(enabled: boolean) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: slackKeys.channels(workspaceId!),
    queryFn: (): Promise<SlackChannel[]> => listSlackChannels(workspaceId!),
    enabled: enabled && !!workspaceId,
    staleTime: 30 * 1000,
  });
}

// ============ Mutations ============

/**
 * Mints the Slack install URL. The caller redirects the browser to it — Slack will not render
 * inside an iframe, and the OAuth callback needs a top-level navigation to come back to.
 */
export function useConnectSlack() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;

  return useMutation({
    mutationFn: (): Promise<{ url: string }> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return createSlackAuthorizeUrl(workspaceId);
    },
  });
}

export function useSetSlackChannel() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (channelId: string): Promise<SlackConnection> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return setSlackChannel(workspaceId, channelId);
    },
    onSuccess: (connection) => {
      if (!workspaceId) return;
      queryClient.setQueryData(slackKeys.connection(workspaceId), connection);
      // Selecting a public channel joins it, which flips its `isMember`.
      queryClient.invalidateQueries({ queryKey: slackKeys.channels(workspaceId) });
    },
  });
}

export function useSetSlackCaptureTags() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tags: string[]): Promise<SlackConnection> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return setSlackCaptureTags(workspaceId, tags);
    },
    onSuccess: (connection) => {
      if (workspaceId) queryClient.setQueryData(slackKeys.connection(workspaceId), connection);
    },
  });
}

export function useSendSlackTestMessage() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;

  return useMutation({
    mutationFn: (): Promise<void> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return sendSlackTestMessage(workspaceId);
    },
  });
}

export function useDisconnectSlack() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (): Promise<void> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return disconnectSlack(workspaceId);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.setQueryData(slackKeys.connection(workspaceId), null);
      queryClient.removeQueries({ queryKey: slackKeys.channels(workspaceId) });
    },
  });
}

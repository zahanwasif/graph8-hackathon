'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';

import { listMessages } from '@/lib/api/messages';
import type { CapturedMessage } from '@/lib/types/message';

// ============ Query Keys ============
export const messageKeys = {
  all: ['messages'] as const,
  list: (workspaceId: string) => [...messageKeys.all, 'list', workspaceId] as const,
};

/** How often the list re-checks for new captures — they arrive from Slack, not from this UI. */
const POLL_INTERVAL_MS = 10_000;

// ============ Queries ============

/** Captured Slack messages for the active workspace, newest first. */
export function useMessages() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: messageKeys.list(workspaceId!),
    queryFn: (): Promise<CapturedMessage[]> => listMessages(workspaceId!),
    enabled: isOrgLoaded && !!workspaceId,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

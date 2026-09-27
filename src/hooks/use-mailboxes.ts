'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';

import {
  connectMailbox,
  disconnectMailbox,
  getMailboxes,
  type ConnectMailboxBody,
  type Mailbox,
} from '@/lib/api/mailboxes';

export const mailboxKeys = {
  all: ['mailboxes'] as const,
  list: (workspaceId: string) => [...mailboxKeys.all, 'list', workspaceId] as const,
};

/** The graph8 org's connected sending mailboxes for the active workspace. */
export function useMailboxes() {
  const { organization, isLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: mailboxKeys.list(workspaceId!),
    queryFn: (): Promise<Mailbox[]> => getMailboxes(workspaceId!),
    enabled: isLoaded && !!workspaceId,
  });
}

/** Connect an SMTP/IMAP sending mailbox, then refresh the list. */
export function useConnectMailbox() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ConnectMailboxBody) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return connectMailbox(workspaceId, body);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({ queryKey: mailboxKeys.list(workspaceId) });
    },
  });
}

/** Disconnect a sending mailbox, then refresh the list. */
export function useDisconnectMailbox() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mailboxId: string) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return disconnectMailbox(workspaceId, mailboxId);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({ queryKey: mailboxKeys.list(workspaceId) });
    },
  });
}

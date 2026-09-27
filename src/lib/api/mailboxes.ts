import { apiFetch } from '@/lib/api';

/** A connected sending mailbox as the Email accounts page shows it (no secrets). */
export interface Mailbox {
  id: string;
  email: string | null;
  displayName: string | null;
  provider: string | null;
  connectionStatus: string | null;
  dailyLimit: number | null;
  createdAt: string | null;
}

export interface ConnectMailboxBody {
  email: string;
  displayName?: string;
  smtpAddress: string;
  smtpPort?: number;
  smtpUsername: string;
  smtpPassword: string;
  imapAddress: string;
  imapPort?: number;
  imapUsername: string;
  imapPassword: string;
  dailyLimit?: number;
}

/** The graph8 org's connected sending mailboxes. */
export async function getMailboxes(workspaceId: string): Promise<Mailbox[]> {
  const { mailboxes } = await apiFetch<{ mailboxes: Mailbox[] }>(
    `/workspaces/${workspaceId}/mailboxes`,
  );
  return mailboxes;
}

/** Connect an SMTP/IMAP sending mailbox. Admin-only. */
export async function connectMailbox(
  workspaceId: string,
  body: ConnectMailboxBody,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/workspaces/${workspaceId}/mailboxes`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Disconnect a sending mailbox. Admin-only; responds 204 with no body. */
export function disconnectMailbox(workspaceId: string, mailboxId: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${workspaceId}/mailboxes/${mailboxId}`, {
    method: 'DELETE',
  });
}

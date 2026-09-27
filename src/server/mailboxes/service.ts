import 'server-only';

import { isGraph8Configured } from '@/server/graph8/client';
import {
  createMailbox,
  deleteMailbox,
  listMailboxes,
  type MailboxSummary,
} from '@/server/graph8/glue';
import { HttpError } from '@/server/http';
import type { ConnectMailboxInput } from '@/server/mailboxes/schemas';

/**
 * Sending-mailbox management. graph8 owns mailboxes org-wide (one org per deployment), so these are
 * not workspace-scoped — the API route enforces who may read/write. SMTP/IMAP passwords are handed
 * to graph8 and never stored in this app's DB.
 */

function ensureConfigured(): void {
  if (!isGraph8Configured()) {
    throw new HttpError(503, 'graph8 is not configured (GRAPH8_API_KEY is missing).');
  }
}

/** The connected sending mailboxes shown on the Email accounts page. */
export async function listWorkspaceMailboxes(): Promise<MailboxSummary[]> {
  ensureConfigured();
  return listMailboxes();
}

/** Connect a new SMTP/IMAP sending mailbox. Admin-only (enforced by the route). */
export async function connectMailbox(input: ConnectMailboxInput): Promise<{ id: string }> {
  ensureConfigured();
  return createMailbox(input);
}

/** Disconnect a sending mailbox. Admin-only (enforced by the route). */
export async function disconnectMailbox(mailboxId: string): Promise<void> {
  ensureConfigured();
  await deleteMailbox(mailboxId);
}

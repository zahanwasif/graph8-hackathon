'use client';

import { useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { CheckCircle2, Mail, Plus, Trash2 } from 'lucide-react';

import { AddMailboxDialog } from '@/components/email-accounts/add-mailbox-dialog';
import { ConfirmActionDialog } from '@/components/confirm-action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useDisconnectMailbox, useMailboxes } from '@/hooks/use-mailboxes';
import { ApiError } from '@/lib/api';
import type { Mailbox } from '@/lib/api/mailboxes';
import { isAdminRole } from '@/lib/types/workspace-member';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

/** A connection status → badge variant + label. graph8 uses active|paused|disconnected|expired|… */
function statusBadge(status: string | null) {
  const value = (status ?? '').toLowerCase();
  if (value === 'active' || value === 'connected') return { variant: 'success' as const, label: 'Active' };
  if (value === 'paused') return { variant: 'warning' as const, label: 'Paused' };
  if (value === 'disconnected' || value === 'expired')
    return { variant: 'destructive' as const, label: status ?? 'Disconnected' };
  return { variant: 'secondary' as const, label: status ?? 'Unknown' };
}

function MailboxRow({
  mailbox,
  isAdmin,
  onDisconnect,
}: {
  mailbox: Mailbox;
  isAdmin: boolean;
  onDisconnect: (mailbox: Mailbox) => void;
}) {
  const badge = statusBadge(mailbox.connectionStatus);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Mail className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {mailbox.displayName || mailbox.email || 'Mailbox'}
          </p>
          {mailbox.email && mailbox.displayName ? (
            <p className="truncate text-sm text-muted-foreground">{mailbox.email}</p>
          ) : null}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {mailbox.provider ? <span>{mailbox.provider}</span> : null}
            {mailbox.dailyLimit != null ? <span>{mailbox.dailyLimit}/day</span> : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {isAdmin ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Disconnect ${mailbox.email ?? 'mailbox'}`}
            onClick={() => onDisconnect(mailbox)}
          >
            <Trash2 className="text-destructive" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmailAccountsClient() {
  const { membership } = useOrganization();
  const isAdmin = isAdminRole(membership?.role);

  const { data: mailboxes, isLoading, isError } = useMailboxes();
  const disconnectMutation = useDisconnectMailbox();

  const [addOpen, setAddOpen] = useState(false);
  const [toDisconnect, setToDisconnect] = useState<Mailbox | null>(null);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  async function handleDisconnect() {
    if (!toDisconnect) return;
    setDisconnectError(null);
    try {
      await disconnectMutation.mutateAsync(toDisconnect.id);
      setToDisconnect(null);
      toast.add({ title: 'Email account disconnected', type: 'success' });
    } catch (err) {
      setDisconnectError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email accounts"
        description="Sending mailboxes graph8 uses to send your event follow-up sequences."
        actions={
          isAdmin ? (
            <Button variant="gradient" onClick={() => setAddOpen(true)}>
              <Plus />
              Add email account
            </Button>
          ) : null
        }
      />

      {!isAdmin ? (
        <div className="rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
          Only workspace admins can connect or remove sending mailboxes.
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={<Mail />}
          title="Couldn't load email accounts"
          description="graph8 couldn't be reached, or it isn't configured on this deployment. Try again in a moment."
        />
      ) : (mailboxes?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Mail />}
          title="No email accounts yet"
          description="Connect a sending mailbox so graph8 can send your event sequences. Without one, launching an event fails with “no email channels configured.”"
          action={
            isAdmin ? (
              <Button variant="gradient" onClick={() => setAddOpen(true)}>
                <Plus />
                Add email account
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success-fg" aria-hidden />
            {mailboxes!.length} sending {mailboxes!.length === 1 ? 'account' : 'accounts'} connected
          </div>
          <div className="space-y-2">
            {mailboxes!.map((mailbox) => (
              <MailboxRow
                key={mailbox.id}
                mailbox={mailbox}
                isAdmin={isAdmin}
                onDisconnect={(m) => {
                  setDisconnectError(null);
                  setToDisconnect(m);
                }}
              />
            ))}
          </div>
        </>
      )}

      <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmActionDialog
        open={toDisconnect !== null}
        onOpenChange={(open) => {
          if (!open && !disconnectMutation.isPending) setToDisconnect(null);
        }}
        title="Disconnect this email account?"
        description={
          <>
            graph8 will stop sending from{' '}
            <span className="font-medium text-foreground">
              {toDisconnect?.email ?? 'this mailbox'}
            </span>
            . Running sequences that rely on it may stop delivering.
          </>
        }
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        onConfirm={handleDisconnect}
        isPending={disconnectMutation.isPending}
        error={disconnectError}
      />
    </div>
  );
}

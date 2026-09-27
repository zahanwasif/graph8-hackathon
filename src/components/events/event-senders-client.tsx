'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useMailboxes } from '@/hooks/use-mailboxes';
import { useSetEventSenders } from '@/hooks/use-events';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

/**
 * The event's "Sending" tab: pick which connected mailboxes this event's sequence sends from.
 * The selection is attached as the sequence's email channels the next time the workflow is
 * published — the missing piece behind graph8's "no email channels configured" launch error.
 */
export function EventSendersClient({
  eventId,
  isAdmin,
  selectedIds,
  hasPublishedSequence,
}: {
  eventId: string;
  isAdmin: boolean;
  selectedIds: string[];
  hasPublishedSequence: boolean;
}) {
  const { data: mailboxes, isLoading, isError } = useMailboxes();
  const setSenders = useSetEventSenders(eventId);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedIds));
  const [error, setError] = useState<string | null>(null);

  // "Nothing selected" means graph8 uses every connected mailbox (see publishEventSequence).
  const usesAll = selected.size === 0;
  const dirty =
    selected.size !== selectedIds.length || selectedIds.some((id) => !selected.has(id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    try {
      await setSenders.mutateAsync([...selected]);
      toast.add({
        title: 'Sending accounts saved',
        description: hasPublishedSequence
          ? 'Republish the workflow (Workflow tab) to apply the change to the sequence.'
          : 'They’ll be attached when you publish the workflow.',
        type: 'success',
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<Mail />}
        title="Couldn't load sending accounts"
        description="graph8 couldn't be reached, or it isn't configured on this deployment. Try again in a moment."
      />
    );
  }

  if ((mailboxes?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={<Mail />}
        title="No email accounts connected"
        description="Connect a sending mailbox first. graph8 needs at least one email channel, or launching this event fails with “no email channels configured.”"
        action={
          <Button variant="gradient" render={<Link href="/email-accounts" />}>
            <Plus />
            Add email account
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Choose which mailboxes this event&rsquo;s sequence sends from.{' '}
          {usesAll ? (
            <span className="text-foreground">All connected accounts will be used.</span>
          ) : (
            <span className="text-foreground">
              {selected.size} of {mailboxes!.length} selected.
            </span>
          )}
        </p>
        <Button variant="outline" size="sm" render={<Link href="/email-accounts" />}>
          <Plus />
          Manage accounts
        </Button>
      </div>

      <div className="space-y-2">
        {mailboxes!.map((mailbox) => {
          const checked = selected.has(mailbox.id);
          const label = mailbox.displayName || mailbox.email || 'Mailbox';
          return (
            <label
              key={mailbox.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                checked ? 'border-primary bg-accent/40' : 'border-border hover:border-primary/40',
                !isAdmin && 'cursor-default opacity-90',
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={checked}
                disabled={!isAdmin || setSenders.isPending}
                onChange={() => toggle(mailbox.id)}
              />
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mail className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{label}</span>
                {mailbox.email && mailbox.displayName ? (
                  <span className="block truncate text-sm text-muted-foreground">{mailbox.email}</span>
                ) : null}
              </span>
              {mailbox.connectionStatus ? (
                <Badge variant={mailbox.connectionStatus.toLowerCase() === 'active' ? 'success' : 'secondary'}>
                  {mailbox.connectionStatus}
                </Badge>
              ) : null}
            </label>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || setSenders.isPending}>
            {setSenders.isPending ? 'Saving…' : 'Save sending accounts'}
          </Button>
          {hasPublishedSequence ? (
            <span className="text-xs text-muted-foreground">
              Republish the workflow to apply changes to the live sequence.
            </span>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
          Only workspace admins can change sending accounts.
        </div>
      )}
    </div>
  );
}

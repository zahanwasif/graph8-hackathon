'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import { ArrowLeft, Hash, Inbox, Target, Trash2 } from 'lucide-react';

import { CaptureRow } from '@/components/captures/capture-row';
import { ConfirmActionDialog } from '@/components/confirm-action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteEvent, useEvent } from '@/hooks/use-events';
import { ApiError } from '@/lib/api';
import { isAdminRole } from '@/lib/types/workspace-member';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

export function EventDetailClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { membership } = useOrganization();
  const isAdmin = isAdminRole(membership?.role);
  const { data: event, isLoading, isError } = useEvent(eventId);

  const deleteMutation = useDeleteEvent();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(eventId);
      setConfirmOpen(false);
      router.push('/events');
    } catch (err) {
      setDeleteError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" render={<Link href="/events" />} className="mb-2 -ml-2">
          <ArrowLeft />
          Events
        </Button>
        <PageHeader
          title={event?.name ?? 'Event'}
          loading={isLoading}
          description={event?.goal ?? undefined}
          actions={
            isAdmin && event ? (
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="text-destructive" />
                Delete event
              </Button>
            ) : null
          }
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError || !event ? (
        <EmptyState
          icon={<Target />}
          title="Event not found"
          description="This event doesn't exist in your workspace, or it couldn't be loaded."
          action={<Button render={<Link href="/events" />}>Back to events</Button>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Hash className="size-3" />
              {event.slackChannelId}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Inbox className="size-3" />
              {event.captureCount} capture{event.captureCount === 1 ? '' : 's'}
            </Badge>
            {!event.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
            {event.workspaceId === null ? <Badge variant="outline">Unassigned</Badge> : null}
          </div>

          {event.captures.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="No captures yet"
              description="Post a message in this event's Slack channel. It'll be captured, scored by graph8, and shown here."
            />
          ) : (
            <div className="space-y-2">
              {event.captures.map((capture) => (
                <CaptureRow key={capture.id} capture={capture} />
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setConfirmOpen(false);
        }}
        title="Delete event?"
        description={
          <>
            This permanently deletes{' '}
            <span className="font-medium text-foreground">{event?.name ?? 'this event'}</span> and
            its {event?.captureCount ?? 0} capture{event?.captureCount === 1 ? '' : 's'}. This
            can&apos;t be undone.
          </>
        }
        confirmLabel="Delete event"
        pendingLabel="Deleting…"
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}

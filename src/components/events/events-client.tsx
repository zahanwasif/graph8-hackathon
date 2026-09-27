'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Hash, Inbox, Plus, Target } from 'lucide-react';

import { CreateEventDialog } from '@/components/events/create-event-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvents } from '@/hooks/use-events';
import type { EventListItem } from '@/lib/types/capture';

function EventRow({ event }: { event: EventListItem }) {
  return (
    <Link href={`/events/${event.id}`} className="block">
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{event.name}</span>
              {!event.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
              {event.workspaceId === null ? <Badge variant="outline">Unassigned</Badge> : null}
            </div>
            {event.goal ? (
              <p className="line-clamp-1 text-sm text-muted-foreground">{event.goal}</p>
            ) : null}
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Hash className="size-3" />
              {event.slackChannelId}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Badge variant="secondary" className="gap-1">
              <Inbox className="size-3" />
              {event.captureCount}
            </Badge>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function EventsClient() {
  const { data: events, isLoading, isError } = useEvents();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        loading={isLoading}
        description="Each event binds a Slack channel and a target profile. Captures flow in and are scored by graph8."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New event
          </Button>
        }
      />

      <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={<Target />}
          title="Couldn't load events"
          description="Something went wrong fetching this workspace's events. Try again in a moment."
        />
      ) : !events || events.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="No events yet"
          description="Create an event and bind a Slack channel. Leads posted there will be captured, scored, and shown under the event."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New event
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

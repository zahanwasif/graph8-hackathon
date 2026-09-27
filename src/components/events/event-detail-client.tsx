'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import {
  ArrowLeft,
  Hash,
  Inbox,
  Loader2,
  MessageSquare,
  Plus,
  Rocket,
  Target,
  Trash2,
  User,
  Users,
  Workflow,
} from 'lucide-react';

import { CaptureRow, dispositionVariant } from '@/components/captures/capture-row';
import { WorkflowBuilder } from '@/components/events/workflow-builder';
import { AddLeadDialog } from '@/components/events/add-lead-dialog';
import { ConfirmActionDialog } from '@/components/confirm-action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useDeleteEvent, useEvent, useEventLeads, useLaunchEvent } from '@/hooks/use-events';
import { ApiError } from '@/lib/api';
import type { LeadListItem } from '@/lib/types/capture';
import { cn } from '@/lib/utils';
import { isAdminRole } from '@/lib/types/workspace-member';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

type EventTab = 'captures' | 'leads' | 'workflow';

const EVENT_TABS: { id: EventTab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'captures', label: 'Captures', icon: MessageSquare },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'workflow', label: 'Workflow', icon: Workflow },
];

/** Every enriched field graph8 returned for the contact, rendered as labelled chips. */
function EnrichedFields({ enriched }: { enriched: LeadListItem['enriched'] }) {
  if (!enriched) return null;
  const phone = enriched.mobilePhone ?? enriched.directPhone ?? null;
  const location = [enriched.city, enriched.state, enriched.country].filter(Boolean).join(', ');
  const items: { label: string; value: string; href?: string }[] = [];
  if (enriched.linkedinUrl)
    items.push({ label: 'LinkedIn', value: enriched.linkedinUrl, href: enriched.linkedinUrl });
  if (phone) items.push({ label: 'Phone', value: phone });
  if (enriched.seniority) items.push({ label: 'Seniority', value: enriched.seniority });
  if (enriched.companyDomain) items.push({ label: 'Domain', value: enriched.companyDomain });
  if (location) items.push({ label: 'Location', value: location });
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label}>
          <span className="font-medium text-foreground/70">{item.label}:</span>{' '}
          {item.href ? (
            <a href={item.href} target="_blank" rel="noreferrer" className="underline">
              {item.value}
            </a>
          ) : (
            item.value
          )}
        </span>
      ))}
    </div>
  );
}

/** One lead intake run — person + score, with pipeline status (processing / failed). */
function LeadRow({ lead }: { lead: LeadListItem }) {
  const who = [lead.title, lead.company].filter(Boolean).join(' @ ');
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">{lead.name ?? 'Unnamed contact'}</span>
          {who ? <span className="text-sm text-muted-foreground">· {who}</span> : null}
        </div>
        {lead.email ? <p className="truncate text-sm text-muted-foreground">{lead.email}</p> : null}
        {lead.status === 'FAILED' && lead.error ? (
          <p className="line-clamp-2 text-sm text-destructive">{lead.error}</p>
        ) : null}
        <EnrichedFields enriched={lead.enriched} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {lead.status === 'COMPLETED' && lead.disposition ? (
          <Badge variant={dispositionVariant(lead.disposition)}>
            {lead.disposition}
            {lead.fitScore != null ? ` · ${lead.fitScore}` : ''}
          </Badge>
        ) : null}
        {lead.status === 'PROCESSING' ? (
          <Badge variant="warning" className="gap-1">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Processing
          </Badge>
        ) : lead.status === 'FAILED' ? (
          <Badge variant="destructive">Failed</Badge>
        ) : (
          <Badge variant="success">Scored</Badge>
        )}
      </div>
    </div>
  );
}

export function EventDetailClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { membership } = useOrganization();
  const isAdmin = isAdminRole(membership?.role);
  const { data: event, isLoading, isError } = useEvent(eventId);

  const deleteMutation = useDeleteEvent();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const launchMutation = useLaunchEvent(eventId);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const [addLeadOpen, setAddLeadOpen] = useState(false);

  const [tab, setTab] = useState<EventTab>('captures');
  const leadsQuery = useEventLeads(eventId, tab === 'leads');

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

  async function handleLaunch() {
    setLaunchError(null);
    try {
      await launchMutation.mutateAsync();
      setLaunchOpen(false);
      toast.add({ title: 'Campaign launched', type: 'success' });
    } catch (err) {
      setLaunchError(errorMessage(err));
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
            event ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setAddLeadOpen(true)}>
                  <Plus />
                  Add lead
                </Button>
                {isAdmin ? (
                  <Button
                    onClick={() => {
                      setLaunchError(null);
                      setLaunchOpen(true);
                    }}
                    disabled={!event.graph8CampaignId}
                  >
                    <Rocket />
                    Launch event
                  </Button>
                ) : null}
                {isAdmin ? (
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
                ) : null}
              </div>
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

          <div role="tablist" aria-label="Event views" className="flex gap-1 border-b border-border">
            {EVENT_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {tab === 'captures' ? (
            event.captures.length === 0 ? (
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
            )
          ) : null}

          {tab === 'leads' ? (
            leadsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : leadsQuery.isError ? (
              <EmptyState
                icon={<Users />}
                title="Couldn't load leads"
                description="The event's graph8 list couldn't be read. Try again in a moment."
              />
            ) : (leadsQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Users />}
                title="No leads yet"
                description="Add a lead, or connect this event's graph8 form. Scored contacts land in the graph8 list and show here."
                action={
                  <Button variant="outline" onClick={() => setAddLeadOpen(true)}>
                    <Plus />
                    Add lead
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {leadsQuery.data!.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} />
                ))}
              </div>
            )
          ) : null}

          <div hidden={tab !== 'workflow'}>
            <WorkflowBuilder
              key={eventId}
              eventId={eventId}
              eventName={event.name}
              workspaceId={event.workspaceId}
              isAdmin={isAdmin}
              publishedSequenceId={event.graph8SequenceId}
            />
          </div>
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

      <ConfirmActionDialog
        open={launchOpen}
        onOpenChange={(open) => {
          if (!open && !launchMutation.isPending) setLaunchOpen(false);
        }}
        title="Launch this event?"
        description={
          <>
            This starts real outreach for{' '}
            <span className="font-medium text-foreground">{event?.name ?? 'this event'}</span> —
            running {event?.graph8SequenceId ? 'the follow-up sequence you published' : 'its graph8 campaign'}{' '}
            and sending to everyone on its list. This can&apos;t be undone.
          </>
        }
        confirmLabel="Launch"
        pendingLabel="Launching…"
        onConfirm={handleLaunch}
        isPending={launchMutation.isPending}
        error={launchError}
      />

      <AddLeadDialog eventId={eventId} open={addLeadOpen} onOpenChange={setAddLeadOpen} />
    </div>
  );
}

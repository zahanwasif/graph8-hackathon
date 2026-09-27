'use client';

import { Check, Clock3, Mail, MessageSquare, Phone, Workflow } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { EventSequence, SequenceStepView } from '@/lib/api/events';
import type { LeadListItem } from '@/lib/types/capture';
import { cn } from '@/lib/utils';

const STEP_ICON = { email: Mail, call: Phone, sms: MessageSquare, other: Workflow } as const;

/** graph8 contact state → a status badge. */
function stateBadge(state: string): { variant: 'success' | 'warning' | 'info' | 'destructive' | 'neutral'; label: string } {
  const value = state.toLowerCase();
  if (value === 'sent' || value === 'replied' || value === 'finished' || value === 'completed')
    return { variant: 'success', label: state };
  if (value === 'bounced' || value === 'failed' || value === 'errored')
    return { variant: 'destructive', label: state };
  if (value === 'queued' || value === 'scheduled') return { variant: 'info', label: state };
  if (value === 'paused' || value === 'waiting') return { variant: 'warning', label: state };
  return { variant: 'neutral', label: state };
}

function StepIcon({ type }: { type: SequenceStepView['type'] }) {
  const Icon = STEP_ICON[type];
  return <Icon className="size-4" aria-hidden />;
}

export function LeadSequenceDialog({
  lead,
  sequence,
  isLoading,
  open,
  onOpenChange,
}: {
  lead: LeadListItem | null;
  sequence: EventSequence | null | undefined;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const contact =
    lead?.contactId != null
      ? sequence?.contacts.find((c) => c.contactId === lead.contactId)
      : undefined;
  const isLive = sequence?.status.toLowerCase() === 'live';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead?.name ?? 'Lead'} — sequence progress
            {sequence ? (
              <Badge variant={isLive ? 'success' : 'secondary'}>
                {isLive ? 'Live' : sequence.status}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {lead?.email ?? 'Where this lead stands in the event follow-up sequence.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !sequence ? (
          <p className="rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
            No sequence has been published for this event yet. Publish a workflow (Workflow tab) to
            start the cadence.
          </p>
        ) : !contact ? (
          <p className="rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
            This lead isn&rsquo;t enrolled in the sequence yet. It joins when the event is launched
            with the lead on its list.
          </p>
        ) : (
          <ol className="space-y-0">
            {sequence.steps.map((step, index) => {
              const done = step.order < contact.currentStepOrder;
              const current = step.order === contact.currentStepOrder;
              const badge = current ? stateBadge(contact.state) : null;
              return (
                <li key={step.order} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full border',
                        done
                          ? 'border-success-border bg-success-bg text-success-fg'
                          : current
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted/40 text-muted-foreground',
                      )}
                    >
                      {done ? <Check className="size-4" /> : <StepIcon type={step.type} />}
                    </span>
                    {index < sequence.steps.length - 1 ? (
                      <span className={cn('my-1 w-px flex-1', done ? 'bg-success-border' : 'bg-border')} />
                    ) : null}
                  </div>
                  <div className={cn('min-w-0 flex-1', index < sequence.steps.length - 1 && 'pb-4')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        {String(step.order).padStart(2, '0')} · {step.type}
                      </span>
                      {step.waitDays > 0 ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock3 className="size-3" />
                          after {step.waitDays}d
                        </span>
                      ) : null}
                      {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                      {done ? <Badge variant="success">Done</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium">{step.title}</p>
                    {current ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">Currently here</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

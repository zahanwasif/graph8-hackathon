'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Clock3, Pencil, Plus } from 'lucide-react';

import { ScheduleEditorDialog } from '@/components/events/schedule-editor-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useEventSchedule, useSetEventSchedule } from '@/hooks/use-events';
import { ApiError } from '@/lib/api';
import type { Schedule } from '@/lib/api/events';
import { cn } from '@/lib/utils';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

const DAY_ABBR: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

/** Compact human summary of a schedule's windows, e.g. "Mon, Tue, Wed, Thu, Fri · 09:00–17:00". */
function summarize(schedule: Schedule): string {
  if (schedule.windows.length === 0) return 'No sending windows';
  const days = schedule.windows.map((w) => DAY_ABBR[w.day.toLowerCase()] ?? w.day).join(', ');
  const uniform = schedule.windows.every(
    (w) => w.start === schedule.windows[0].start && w.end === schedule.windows[0].end,
  );
  const time = uniform
    ? `${schedule.windows[0].start}–${schedule.windows[0].end}`
    : 'varies by day';
  const tz = schedule.timezone ? ` ${schedule.timezone}` : '';
  return `${days} · ${time}${tz}`;
}

function ScheduleOption({
  title,
  summary,
  checked,
  disabled,
  onSelect,
}: {
  title: string;
  summary: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        checked ? 'border-primary bg-accent/40' : 'border-border hover:border-primary/40',
        disabled && 'cursor-default opacity-90',
      )}
    >
      <input
        type="radio"
        name="event-schedule"
        className="mt-0.5 size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <CalendarClock className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="size-3" aria-hidden />
          {summary}
        </span>
      </span>
    </label>
  );
}

/**
 * The event's "Schedule" tab: pick the sending window graph8 uses for this event's sequence.
 * Saving syncs the choice to the live sequence on graph8 — queued sends release inside the window.
 */
export function EventScheduleClient({
  eventId,
  isAdmin,
  hasPublishedSequence,
}: {
  eventId: string;
  isAdmin: boolean;
  hasPublishedSequence: boolean;
}) {
  const { data, isLoading, isError } = useEventSchedule(eventId, true);
  const setSchedule = useSetEventSchedule(eventId);

  // null = graph8's default window. Sync local selection once the query resolves.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  useEffect(() => {
    if (data) setSelectedId(data.selectedId);
  }, [data]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(schedule: Schedule) {
    setEditing(schedule);
    setEditorOpen(true);
  }

  const dirty = data ? selectedId !== data.selectedId : false;

  async function save() {
    setError(null);
    try {
      await setSchedule.mutateAsync(selectedId);
      toast.add({
        title: 'Sending schedule saved',
        description: hasPublishedSequence
          ? 'Synced to the live sequence — queued sends release inside this window.'
          : 'It’ll be attached when you publish the workflow.',
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
        icon={<CalendarClock />}
        title="Couldn't load schedules"
        description="graph8 couldn't be reached, or it isn't configured on this deployment. Try again in a moment."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          When graph8 sends this event&rsquo;s sequence. Sends outside the window wait — a lead can
          sit <span className="font-medium text-foreground">queued</span> until the next open window.
        </p>
        {isAdmin ? (
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus />
            New schedule
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <ScheduleOption
          title="graph8 default"
          summary="graph8's default window (Mon–Fri 09:00–17:00 UTC)"
          checked={selectedId === null}
          disabled={!isAdmin || setSchedule.isPending}
          onSelect={() => setSelectedId(null)}
        />
        {data!.schedules.map((schedule) => (
          <div key={schedule.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <ScheduleOption
                title={schedule.name}
                summary={summarize(schedule)}
                checked={selectedId === schedule.id}
                disabled={!isAdmin || setSchedule.isPending}
                onSelect={() => setSelectedId(schedule.id)}
              />
            </div>
            {isAdmin ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${schedule.name}`}
                onClick={() => openEdit(schedule)}
              >
                <Pencil />
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!dirty || setSchedule.isPending}>
            {setSchedule.isPending ? 'Saving…' : 'Save schedule'}
          </Button>
          {hasPublishedSequence ? (
            <Badge variant="info" className="gap-1">
              <CalendarClock className="size-3" aria-hidden />
              Syncs to the live sequence
            </Badge>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
          Only workspace admins can change the sending schedule.
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Create and edit sending windows here — they sync to graph8 and apply to this event&rsquo;s
        sequence.
      </p>

      <ScheduleEditorDialog
        eventId={eventId}
        schedule={editing}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </div>
  );
}

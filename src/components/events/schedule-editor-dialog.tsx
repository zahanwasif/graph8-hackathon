'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useCreateSchedule, useUpdateSchedule } from '@/hooks/use-events';
import { ApiError } from '@/lib/api';
import type { Schedule, SendingWeek } from '@/lib/api/events';
import { cn } from '@/lib/utils';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

const DAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
] as const;

type DayKey = (typeof DAYS)[number]['key'];
type DayRow = { enabled: boolean; start: string; end: string };
type WeekState = Record<DayKey, DayRow>;

function emptyWeek(): WeekState {
  return DAYS.reduce((acc, day) => {
    acc[day.key] = { enabled: false, start: '09:00', end: '17:00' };
    return acc;
  }, {} as WeekState);
}

/** Prefill the form's week model from a schedule's flat windows array. */
function weekFromSchedule(schedule: Schedule): WeekState {
  const week = emptyWeek();
  for (const window of schedule.windows) {
    const key = window.day.toLowerCase() as DayKey;
    if (week[key]) week[key] = { enabled: true, start: window.start, end: window.end };
  }
  return week;
}

const PRESETS: { label: string; apply: () => WeekState }[] = [
  {
    label: 'Weekdays 9–5',
    apply: () => {
      const week = emptyWeek();
      (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as DayKey[]).forEach((d) => {
        week[d] = { enabled: true, start: '09:00', end: '17:00' };
      });
      return week;
    },
  },
  {
    label: 'Every day 9–5',
    apply: () => {
      const week = emptyWeek();
      DAYS.forEach((d) => (week[d.key] = { enabled: true, start: '09:00', end: '17:00' }));
      return week;
    },
  },
  {
    label: '24/7',
    apply: () => {
      const week = emptyWeek();
      DAYS.forEach((d) => (week[d.key] = { enabled: true, start: '00:00', end: '23:59' }));
      return week;
    },
  },
];

function EditorForm({
  eventId,
  schedule,
  onOpenChange,
}: {
  eventId: string;
  schedule: Schedule | null;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = schedule !== null;
  const createMutation = useCreateSchedule(eventId);
  const updateMutation = useUpdateSchedule(eventId);
  const pending = createMutation.isPending || updateMutation.isPending;

  const [name, setName] = useState(schedule?.name ?? '');
  const [timezone, setTimezone] = useState(schedule?.timezone ?? 'UTC');
  const [week, setWeek] = useState<WeekState>(schedule ? weekFromSchedule(schedule) : PRESETS[0].apply());
  const [error, setError] = useState<string | null>(null);

  function setDay(key: DayKey, patch: Partial<DayRow>) {
    setWeek((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  const enabledDays = DAYS.filter((d) => week[d.key].enabled);
  const invalidDay = enabledDays.find((d) => week[d.key].start >= week[d.key].end);
  const canSubmit =
    Boolean(name.trim()) && enabledDays.length > 0 && !invalidDay && !pending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);

    const config: SendingWeek = {};
    for (const day of DAYS) {
      const row = week[day.key];
      config[day.key] = row.enabled ? { start: row.start, end: row.end } : null;
    }

    try {
      if (isEdit && schedule) {
        await updateMutation.mutateAsync({
          scheduleId: schedule.id,
          body: { name: name.trim(), timezone: timezone.trim() || 'UTC', config },
        });
        toast.add({ title: 'Schedule updated', type: 'success' });
      } else {
        await createMutation.mutateAsync({ name: name.trim(), timezone: timezone.trim() || 'UTC', config });
        toast.add({ title: 'Schedule created', description: 'Select it above to use it for this event.', type: 'success' });
      }
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit schedule' : 'New sending schedule'}</DialogTitle>
          <DialogDescription>
            The days and hours graph8 may send in. Times are 24-hour, in the schedule&rsquo;s
            timezone. Overnight windows aren&rsquo;t supported — split them across days.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div className="space-y-1.5">
            <label htmlFor="sched-name" className="text-sm font-medium">Name</label>
            <Input
              id="sched-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Always on"
              maxLength={120}
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sched-tz" className="text-sm font-medium">Timezone</label>
            <Input
              id="sched-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="UTC"
              maxLength={64}
              disabled={pending}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={() => setWeek(preset.apply())}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <fieldset className="space-y-2" disabled={pending}>
          {DAYS.map((day) => {
            const row = week[day.key];
            return (
              <div key={day.key} className="flex items-center gap-3">
                <label className="flex w-20 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={row.enabled}
                    onChange={(e) => setDay(day.key, { enabled: e.target.checked })}
                  />
                  {day.label}
                </label>
                <div className={cn('flex items-center gap-2', !row.enabled && 'opacity-40')}>
                  <Input
                    type="time"
                    value={row.start}
                    disabled={!row.enabled}
                    onChange={(e) => setDay(day.key, { start: e.target.value })}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={row.end}
                    disabled={!row.enabled}
                    onChange={(e) => setDay(day.key, { end: e.target.value })}
                    className="w-32"
                  />
                </div>
              </div>
            );
          })}
        </fieldset>

        {invalidDay ? (
          <p className="text-sm text-destructive">
            {invalidDay.label}: start must be before end (no overnight windows).
          </p>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create schedule'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function ScheduleEditorDialog({
  eventId,
  schedule,
  open,
  onOpenChange,
}: {
  eventId: string;
  /** null → create mode; a schedule → edit mode. */
  schedule: Schedule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <EditorForm eventId={eventId} schedule={schedule} onOpenChange={onOpenChange} /> : null}
    </Dialog>
  );
}

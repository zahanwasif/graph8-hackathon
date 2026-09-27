'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Hash, Lock } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useCreateEvent } from '@/hooks/use-events';
import { useSlackChannels, useSlackConnection } from '@/hooks/use-slack';
import { ApiError } from '@/lib/api';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

type CreateEventDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function CreateEventForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { data: slack, isLoading: slackLoading } = useSlackConnection();
  const connected = Boolean(slack);
  const { data: channels = [], isLoading: channelsLoading } = useSlackChannels(connected);
  const createEvent = useCreateEvent();

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [targetProfile, setTargetProfile] = useState('');
  const [channelId, setChannelId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && channelId.length > 0 && !createEvent.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const created = await createEvent.mutateAsync({
        name: name.trim(),
        goal: goal.trim(),
        targetProfile: targetProfile.trim(),
        slackChannelId: channelId,
        slackChannelName: channels.find((channel) => channel.id === channelId)?.name,
      });
      toast.add({ title: `Event “${created.name}” created`, type: 'success' });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <DialogContent>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>
            Bind a Slack channel and target profile. graph8 provisions the persona and list; the
            shared extraction skill scores every capture against this event&rsquo;s goal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="event-name" className="text-sm font-medium">
            Event name
          </label>
          <Input
            id="event-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="graph8 Hackathon — SWE Lead Hunt"
            maxLength={120}
            disabled={createEvent.isPending}
            autoFocus
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="event-goal" className="text-sm font-medium">
            Goal
          </label>
          <Input
            id="event-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Find the best software engineering lead to hire for graph8"
            maxLength={500}
            disabled={createEvent.isPending}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="event-profile" className="text-sm font-medium">
            Target profile
          </label>
          <textarea
            id="event-profile"
            value={targetProfile}
            onChange={(event) => setTargetProfile(event.target.value)}
            placeholder="6+ yrs backend; distributed systems; leadership. Must-have: senior+ and leadership signal."
            maxLength={2000}
            rows={3}
            disabled={createEvent.isPending}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            What a strong match looks like. Passed to the extraction skill for scoring.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="event-channel" className="text-sm font-medium">
            Slack channel
          </label>
          {slackLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : !connected ? (
            <p className="text-sm text-muted-foreground">
              Connect Slack first on the{' '}
              <Link href="/integrations" className="underline">
                integrations page
              </Link>
              .
            </p>
          ) : (
            <Select value={channelId} onValueChange={setChannelId} disabled={createEvent.isPending}>
              <SelectTrigger id="event-channel" className="h-8">
                <SelectValue placeholder={channelsLoading ? 'Loading channels…' : 'Choose a channel'} />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    <span className="flex items-center gap-1.5">
                      {channel.isPrivate ? <Lock className="size-3" /> : <Hash className="size-3" />}
                      {channel.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            Every top-level message in this channel becomes a capture.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createEvent.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {createEvent.isPending ? 'Creating…' : 'Create event'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function CreateEventDialog({ open, onOpenChange }: CreateEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <CreateEventForm onOpenChange={onOpenChange} /> : null}
    </Dialog>
  );
}

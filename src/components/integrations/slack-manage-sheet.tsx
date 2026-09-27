'use client';

import { useState } from 'react';
import { Hash, Lock, Send } from 'lucide-react';

import { CaptureTagsEditor } from '@/components/integrations/capture-tags-editor';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useSendSlackTestMessage, useSetSlackChannel, useSlackChannels } from '@/hooks/use-slack';
import { workspaceMemberErrorMessage } from '@/lib/workspace-members-format';
import type { SlackConnection } from '@/lib/types/slack';

type SlackManageSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: SlackConnection | null;
  isAdmin: boolean;
  onDisconnect: () => void;
};

/**
 * The "Manage settings" panel for a connected Slack: which channel this workspace posts to,
 * and a test message to prove it works. Channel changes are admin-only (the API enforces it).
 */
export function SlackManageSheet({
  open,
  onOpenChange,
  connection,
  isAdmin,
  onDisconnect,
}: SlackManageSheetProps) {
  const { data: channels = [], isLoading, error: channelsError } = useSlackChannels(open);
  const setChannelMutation = useSetSlackChannel();
  const testMutation = useSendSlackTestMessage();
  const [error, setError] = useState<string | null>(null);

  // Private channels only list when the bot is already in them, and joining is automatic for
  // public ones, so every listed channel is selectable.
  async function handleChannelChange(channelId: string) {
    setError(null);
    try {
      const updated = await setChannelMutation.mutateAsync(channelId);
      toast.add({ title: `Posting to #${updated.channelName}`, type: 'success' });
    } catch (err) {
      setError(workspaceMemberErrorMessage(err));
    }
  }

  async function handleTest() {
    setError(null);
    try {
      await testMutation.mutateAsync();
      toast.add({
        title: 'Test message sent',
        description: `Check #${connection?.channelName} in Slack.`,
        type: 'success',
      });
    } catch (err) {
      setError(workspaceMemberErrorMessage(err));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Slack settings</SheetTitle>
          <SheetDescription>
            Connected to <span className="font-medium text-foreground">{connection?.teamName}</span>
            .
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4">
          <div className="space-y-1.5">
            <label htmlFor="slack-channel" className="text-sm font-medium">
              Channel
            </label>
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <Select
                value={connection?.channelId ?? undefined}
                onValueChange={(value) => void handleChannelChange(value)}
                disabled={!isAdmin || setChannelMutation.isPending || !!channelsError}
              >
                <SelectTrigger id="slack-channel" className="h-8 w-full">
                  <SelectValue placeholder="Choose a channel" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      <span className="flex items-center gap-1.5">
                        {channel.isPrivate ? (
                          <Lock className="size-3.5 text-muted-foreground" />
                        ) : (
                          <Hash className="size-3.5 text-muted-foreground" />
                        )}
                        {channel.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? 'Public channels are joined automatically. For a private channel, run /invite @your-bot in Slack first.'
                : 'Only workspace admins can change the channel.'}
            </p>
          </div>

          {(error || channelsError) && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error ?? workspaceMemberErrorMessage(channelsError)}
            </div>
          )}

          {connection ? (
            <CaptureTagsEditor tags={connection.captureTags} isAdmin={isAdmin} />
          ) : null}

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Test the connection</p>
            <p className="text-xs text-muted-foreground">
              Posts a short hello to the selected channel.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTest()}
              disabled={!connection?.channelId || testMutation.isPending}
            >
              <Send />
              {testMutation.isPending ? 'Sending…' : 'Send test message'}
            </Button>
          </div>
        </div>

        {isAdmin ? (
          <SheetFooter>
            <Button variant="destructive" onClick={onDisconnect}>
              Disconnect Slack
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

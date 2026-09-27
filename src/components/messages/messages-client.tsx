'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Hash, MessageSquare, MessagesSquare, Mic } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMessages } from '@/hooks/use-messages';
import { useSlackConnection } from '@/hooks/use-slack';
import { avatarColorStyle, initials } from '@/lib/avatar-color';
import type { CapturedMessage } from '@/lib/types/message';
import { workspaceMemberErrorMessage } from '@/lib/workspace-members-format';

const COLUMNS = 6;

/** "3m ago" for today-ish, a date after that. */
function formatReceived(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (minutes < 1) return 'just now';
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), 'hour');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function TypeBadge({ message }: { message: CapturedMessage }) {
  if (message.inputType === 'VOICE') {
    return (
      <Badge variant="info">
        <Mic />
        Voice
        {message.mediaDurationSec ? ` · ${formatDuration(message.mediaDurationSec)}` : ''}
      </Badge>
    );
  }
  return (
    <Badge variant="neutral">
      <MessageSquare />
      Text
    </Badge>
  );
}

function Author({ message }: { message: CapturedMessage }) {
  const name = message.authorName ?? message.slackUserId;
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
        style={avatarColorStyle(name)}
        aria-hidden
      >
        {initials(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{message.channelName}</p>
      </div>
    </div>
  );
}

/** Who the message is about, as extracted by Groq. */
function ContactCell({ message }: { message: CapturedMessage }) {
  const { email, firstName, lastName, jobTitle, company } = message.contact;
  const name = [firstName, lastName].filter(Boolean).join(' ');
  const role = [jobTitle, company].filter(Boolean).join(' @ ');

  if (!name && !role && !email) {
    return <span className="text-muted-foreground italic">No contact found</span>;
  }

  return (
    <div className="min-w-0 max-w-64 space-y-0.5">
      {name ? <p className="truncate font-medium">{name}</p> : null}
      {role ? <p className="truncate text-xs text-muted-foreground">{role}</p> : null}
      {email ? (
        <a href={`mailto:${email}`} className="block truncate text-xs text-primary hover:underline">
          {email}
        </a>
      ) : null}
    </div>
  );
}

/** The captured words, clamped to a few lines with a toggle — transcripts run long. */
function MessageBody({ message }: { message: CapturedMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.content.length > 280 || message.content.split('\n').length > 4;

  return (
    <div className="max-w-2xl space-y-1">
      <p className={`whitespace-pre-wrap ${expanded ? '' : 'line-clamp-4'}`}>
        {message.content || (
          <span className="text-muted-foreground italic">No speech detected</span>
        )}
      </p>
      {message.inputType === 'VOICE' && message.caption ? (
        <p className="text-xs text-muted-foreground">Caption: {message.caption}</p>
      ) : null}
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, row) => (
        <TableRow key={row} className="hover:bg-transparent">
          {Array.from({ length: COLUMNS }).map((__, cell) => (
            <TableCell key={cell} className="px-4 py-3">
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/**
 * Every Slack message captured by a hashtag — typed messages and transcribed voice notes in one
 * list. Captures arrive from Slack in the background, so the list polls (see `useMessages`).
 */
export function MessagesClient() {
  const { data: messages = [], isLoading, error } = useMessages();
  const { data: slack } = useSlackConnection();

  const tags = slack?.captureTags ?? [];
  const tagList = tags.map((t) => `#${t}`).join(', ');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description={
          slack?.channelName && tags.length
            ? `Messages and voice notes tagged ${tagList} in #${slack.channelName}.`
            : 'Messages and voice notes captured from Slack.'
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {workspaceMemberErrorMessage(error)}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">From</TableHead>
              <TableHead className="px-4">Message</TableHead>
              <TableHead className="px-4">Contact</TableHead>
              <TableHead className="px-4">Type</TableHead>
              <TableHead className="px-4">Tag</TableHead>
              <TableHead className="px-4">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows />
            ) : messages.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS} className="p-0">
                  <EmptyState
                    bordered={false}
                    icon={<MessagesSquare />}
                    title="No messages yet"
                    description={
                      slack?.channelName
                        ? `Post a message or voice note with ${tags.length ? `#${tags[0]}` : 'a capture hashtag'} in #${slack.channelName}.`
                        : 'Connect Slack and choose a channel to start capturing messages.'
                    }
                    action={
                      slack?.channelName ? null : (
                        <Button render={<Link href="/integrations" />}>Set up Slack</Button>
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              messages.map((message) => (
                <TableRow key={message.id} className="align-top">
                  <TableCell className="px-4 py-3">
                    <Author message={message} />
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    <MessageBody message={message} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <ContactCell message={message} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <TypeBadge message={message} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {message.matchedTag ? (
                      <Badge variant="neutral">
                        <Hash />
                        {message.matchedTag}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
                      {formatReceived(message.createdAt)}
                    </time>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

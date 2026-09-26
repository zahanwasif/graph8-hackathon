'use client';

import Link from 'next/link';
import { useOrganization } from '@clerk/nextjs';
import { CheckCircle2, Hash, MailPlus, TriangleAlert, Users } from 'lucide-react';

import { SlackLogo } from '@/components/integrations/logos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useSlackConnection } from '@/hooks/use-slack';
import { useWorkspaceInvitations, useWorkspaceMembers } from '@/hooks/use-workspace-members';
import { isAdminRole } from '@/lib/types/workspace-member';

/** Two stat cards (team, Slack) and, until Slack is connected, the one next step. */
export function HomeClient() {
  const { organization, membership, isLoaded } = useOrganization();
  const isAdmin = isAdminRole(membership?.role);

  const { data: members, isLoading: membersLoading } = useWorkspaceMembers();
  const { data: invitations } = useWorkspaceInvitations();
  const { data: slack, isLoading: slackLoading } = useSlackConnection();

  const pendingCount = invitations?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={organization?.name ?? 'Home'}
        loading={!isLoaded}
        description="An overview of this workspace."
        actions={
          isAdmin ? (
            <Button variant="gradient" render={<Link href="/workspace-settings" />}>
              <MailPlus />
              Invite people
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card accent="primary" accentSide="left">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Users className="size-4" />
              Team
            </CardDescription>
            <CardTitle className="text-2xl">
              {membersLoading ? <Skeleton className="h-8 w-12" /> : (members?.length ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {pendingCount > 0
              ? `${pendingCount} pending invitation${pendingCount === 1 ? '' : 's'}`
              : 'No pending invitations'}
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" render={<Link href="/workspace-settings" />}>
              Manage members
            </Button>
          </CardFooter>
        </Card>

        <Card
          accent={slack ? (slack.channelId ? 'success' : 'warning') : undefined}
          accentSide="left"
        >
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <SlackLogo className="size-4" />
              Slack
            </CardDescription>
            <CardTitle className="text-2xl">
              {slackLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : slack ? (
                slack.teamName
              ) : (
                'Not connected'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {slackLoading ? null : !slack ? (
              'Connect Slack to post workspace updates to a channel.'
            ) : slack.channelId ? (
              <Badge variant="success">
                <CheckCircle2 />
                Posting to <Hash className="-mr-1" />
                {slack.channelName}
              </Badge>
            ) : (
              <Badge variant="warning">
                <TriangleAlert />
                No channel selected
              </Badge>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" render={<Link href="/integrations" />}>
              {slack ? 'Manage Slack' : 'Go to integrations'}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {!slackLoading && !slack ? (
        <EmptyState
          icon={<SlackLogo />}
          title="Connect your Slack"
          description="Install the bot in your Slack workspace, then choose the channel this workspace posts to."
          action={
            <Button render={<Link href="/integrations" />}>Set up Slack</Button>
          }
        />
      ) : null}
    </div>
  );
}

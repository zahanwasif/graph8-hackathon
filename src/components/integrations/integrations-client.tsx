'use client';

import { useEffect, useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';

import { ConfirmActionDialog } from '@/components/confirm-action-dialog';
import {
  IntegrationCard,
  type IntegrationCardState,
} from '@/components/integrations/integration-card';
import { SlackManageSheet } from '@/components/integrations/slack-manage-sheet';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useCallbackMessage } from '@/hooks/use-callback-message';
import { useConnectSlack, useDisconnectSlack, useSlackConnection } from '@/hooks/use-slack';
import { APP_NAME } from '@/lib/app-config';
import { INTEGRATION_LIST } from '@/lib/integrations/catalog';
import { isAdminRole } from '@/lib/types/workspace-member';
import { workspaceMemberErrorMessage } from '@/lib/workspace-members-format';
import type { SlackConnection } from '@/lib/types/slack';

/**
 * Why a connect attempt failed, in the user's terms. The OAuth callback can only redirect with
 * a slug — it has no page to render into — so the copy lives here.
 */
const FAILURE_REASONS: Record<string, string> = {
  cancelled: 'The Slack connection was cancelled.',
  denied: 'Slack declined the connection. Check that you can install apps in that Slack workspace.',
  invalid_state: 'That connection link expired or belongs to another user. Please try again.',
  missing_code: 'Slack did not return an authorization code. Please try again.',
  exchange_failed: 'We could not complete the connection with Slack. Please try again.',
  not_configured: 'Slack is not configured on this deployment yet.',
};

/** Connected but no channel chosen yet is its own state — the integration can't post. */
function slackCardState(connection: SlackConnection | null | undefined): IntegrationCardState {
  if (!connection) return 'disconnected';
  return connection.channelId ? 'connected' : 'error';
}

export function IntegrationsClient() {
  const { membership } = useOrganization();
  const isAdmin = isAdminRole(membership?.role);
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: connection, isLoading, error } = useSlackConnection();
  const connectMutation = useConnectSlack();
  const disconnectMutation = useDisconnectSlack();

  const {
    success: callbackSuccess,
    error: callbackError,
    clearCallback,
    hasCallbackParam,
  } = useCallbackMessage({
    paramName: 'connected',
    successValue: '1',
    successMessage: 'Slack connected. Choose the channel to post to.',
    errorMessage: 'Slack connection failed. Please try again.',
  });

  const [manualError, setManualError] = useState<string | null>(null);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // The callback's `reason` slug is more specific than the generic callback message, when present.
  const failureReason = searchParams.get('reason');
  const justConnected = searchParams.get('connected') === '1';

  useEffect(() => {
    if (!hasCallbackParam) return;
    // Straight into channel selection after a fresh install — it's the step that's left.
    if (justConnected) setIsManageOpen(true);
    router.replace('/integrations');
  }, [hasCallbackParam, justConnected, router]);

  const displayError =
    (callbackError ? (failureReason && FAILURE_REASONS[failureReason]) || callbackError : null) ??
    manualError ??
    (error ? workspaceMemberErrorMessage(error) : null);

  async function handleConnect() {
    clearCallback();
    setManualError(null);
    try {
      const { url } = await connectMutation.mutateAsync();
      // A top-level navigation, not an iframe: Slack refuses to be framed, and the OAuth
      // callback has to land somewhere it can redirect back from.
      window.location.href = url;
    } catch (err) {
      setManualError(workspaceMemberErrorMessage(err));
    }
  }

  async function handleConfirmDisconnect() {
    setDisconnectError(null);
    try {
      await disconnectMutation.mutateAsync();
      setIsDisconnectOpen(false);
      setIsManageOpen(false);
    } catch (err) {
      setDisconnectError(workspaceMemberErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description={`Connect ${APP_NAME} to the tools your team already runs on.`}
      />

      {callbackSuccess && (
        <div className="rounded-lg border border-success-border bg-success-bg px-4 py-3 text-sm text-success-fg">
          {callbackSuccess}
        </div>
      )}

      {displayError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {displayError}
        </div>
      )}

      {!isAdmin && (
        <div className="rounded-lg border border-info-border bg-info-bg px-4 py-3 text-sm text-info-fg">
          Only workspace admins can connect or disconnect integrations.
        </div>
      )}

      {connection && !connection.channelId && (
        <div className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
          Slack is connected to {connection.teamName}, but no channel is selected yet. Open{' '}
          <span className="font-medium">Manage settings</span> to choose one.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATION_LIST.map((descriptor) => {
          if (isLoading) {
            return <Skeleton key={descriptor.key} className="h-[22rem] rounded-xl" />;
          }

          return (
            <IntegrationCard
              key={descriptor.key}
              descriptor={descriptor}
              state={slackCardState(connection)}
              detail={
                connection
                  ? `${connection.teamName}${connection.channelName ? ` · #${connection.channelName}` : ''}`
                  : undefined
              }
              busy={connectMutation.isPending || disconnectMutation.isPending}
              onConnect={isAdmin ? () => void handleConnect() : undefined}
              onDisconnect={isAdmin ? () => setIsDisconnectOpen(true) : undefined}
              onManage={() => setIsManageOpen(true)}
            />
          );
        })}
      </div>

      <SlackManageSheet
        open={isManageOpen && !!connection}
        onOpenChange={setIsManageOpen}
        connection={connection ?? null}
        isAdmin={isAdmin}
        onDisconnect={() => setIsDisconnectOpen(true)}
      />

      <ConfirmActionDialog
        open={isDisconnectOpen}
        onOpenChange={(open) => {
          if (!open && !disconnectMutation.isPending) {
            setIsDisconnectOpen(false);
            setDisconnectError(null);
          }
        }}
        title="Disconnect Slack?"
        description={
          <>
            This workspace will stop posting to{' '}
            <span className="font-medium text-foreground">
              {connection?.channelName ? `#${connection.channelName}` : connection?.teamName}
            </span>
            . You can connect again at any time.
          </>
        }
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        onConfirm={handleConfirmDisconnect}
        isPending={disconnectMutation.isPending}
        error={disconnectError}
      />
    </div>
  );
}

'use client';

import { CheckCircle2, TriangleAlert } from 'lucide-react';

import { Badge, type BadgeStatus } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { INTEGRATION_LOGOS } from '@/components/integrations/logos';
import type { IntegrationDescriptor } from '@/lib/integrations/catalog';

/** The connection state a card renders, flattened out of whatever backend model backs it. */
export type IntegrationCardState = 'disconnected' | 'connected' | 'error';

const STATE_META: Record<
  Exclude<IntegrationCardState, 'disconnected'>,
  { label: string; variant: BadgeStatus; icon: typeof CheckCircle2 }
> = {
  connected: { label: 'Connected', variant: 'success', icon: CheckCircle2 },
  error: { label: 'Needs attention', variant: 'danger', icon: TriangleAlert },
};

type IntegrationCardProps = {
  descriptor: IntegrationDescriptor;
  state: IntegrationCardState;
  /** Extra line under the description — the portal id, the account, whatever identifies it. */
  detail?: string;
  busy?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** Omit `onConnect` / `onDisconnect` when the viewer is not allowed to do them. */
  /** Present only for an integration that has something to configure once connected. */
  onManage?: () => void;
};

export function IntegrationCard({
  descriptor,
  state,
  detail,
  busy = false,
  onConnect,
  onDisconnect,
  onManage,
}: IntegrationCardProps) {
  const Logo = INTEGRATION_LOGOS[descriptor.key];
  const isConnected = state === 'connected' || state === 'error';
  const meta = state === 'disconnected' ? null : STATE_META[state];

  return (
    <Card
      // The accent rule ties the card to a state the same way a status badge does, so a connected
      // integration is legible from across the grid without reading the badge.
      accent={state === 'connected' ? 'success' : state === 'error' ? 'danger' : undefined}
      accentSide="top"
      className="transition-all duration-(--duration-fast) ease-(--ease-standard) hover:-translate-y-px hover:shadow-md"
    >
      <CardContent className="flex flex-col items-center gap-3 pt-2 text-center">
        {/* The logo is the card's subject, so it sits centred and large rather than as a
            corner icon chip the way the lead-source grid does it. */}
        <div className="flex size-16 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Logo className="size-9" />
        </div>

        <div className="space-y-1">
          <h3 className="font-heading leading-snug font-medium">{descriptor.name}</h3>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {descriptor.category}
          </p>
        </div>

        {meta ? (
          <Badge variant={meta.variant}>
            <meta.icon />
            {meta.label}
          </Badge>
        ) : null}

        <p className="text-sm text-balance text-muted-foreground">{descriptor.description}</p>

        {detail ? (
          <p className="font-mono text-xs break-all text-muted-foreground">{detail}</p>
        ) : null}
      </CardContent>

      <CardFooter className="justify-center gap-2">
        {/* The connect action is `default`, not `gradient`: THEME.md reserves the brand gradient
            for the one primary action in a PageHeader, and this is a card in a grid. */}
        {isConnected ? (
          <>
            {/* Managing is the thing a connected integration is actually for; disconnecting is
                the rare, destructive one. Hence `default` and `outline` respectively. */}
            {onManage ? (
              <Button variant="default" size="sm" className="flex-1" onClick={onManage}>
                Manage settings
              </Button>
            ) : null}
            {onDisconnect ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onDisconnect}
                disabled={busy}
              >
                {busy ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={onConnect}
            // No handler means the viewer may not connect (not an admin) — say so, don't hide it.
            disabled={busy || !onConnect}
          >
            {busy ? 'Connecting…' : `Connect ${descriptor.name}`}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

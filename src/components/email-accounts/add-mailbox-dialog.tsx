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
import { useConnectMailbox } from '@/hooks/use-mailboxes';
import { ApiError } from '@/lib/api';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

type AddMailboxDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Optional numeric field → number | undefined (blank means "use graph8's default"). */
function toPort(value: string): number | undefined {
  const n = Number(value.trim());
  return value.trim() && Number.isInteger(n) && n > 0 ? n : undefined;
}

function AddMailboxForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const connect = useConnectMailbox();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [smtpAddress, setSmtpAddress] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [imapAddress, setImapAddress] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapUsername, setImapUsername] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    Boolean(
      email.trim() &&
        smtpAddress.trim() &&
        smtpUsername.trim() &&
        smtpPassword &&
        imapAddress.trim() &&
        imapUsername.trim() &&
        imapPassword,
    ) && !connect.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      await connect.mutateAsync({
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        smtpAddress: smtpAddress.trim(),
        smtpPort: toPort(smtpPort),
        smtpUsername: smtpUsername.trim(),
        smtpPassword,
        imapAddress: imapAddress.trim(),
        imapPort: toPort(imapPort),
        imapUsername: imapUsername.trim(),
        imapPassword,
      });
      toast.add({
        title: 'Email account connected',
        description: 'graph8 can now send from this mailbox. Launch an event to start outreach.',
        type: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Add email account</DialogTitle>
          <DialogDescription>
            Connect a sending mailbox over SMTP/IMAP. graph8 sends sequence emails from it. Google
            and Microsoft mailboxes need OAuth and can&rsquo;t be connected here. Credentials go
            straight to graph8 — they&rsquo;re never stored in {`this app`}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="mbx-email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="mbx-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sender@yourdomain.com"
              disabled={connect.isPending}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="mbx-name" className="text-sm font-medium">
              Display name <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="mbx-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Maya Chen"
              maxLength={120}
              disabled={connect.isPending}
            />
          </div>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-3" disabled={connect.isPending}>
          <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Outgoing (SMTP)
          </legend>
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div className="space-y-1.5">
              <label htmlFor="smtp-host" className="text-sm font-medium">
                Host
              </label>
              <Input
                id="smtp-host"
                value={smtpAddress}
                onChange={(e) => setSmtpAddress(e.target.value)}
                placeholder="smtp.yourdomain.com"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="smtp-port" className="text-sm font-medium">
                Port
              </label>
              <Input
                id="smtp-port"
                inputMode="numeric"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="smtp-user" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="smtp-user"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
                placeholder="sender@yourdomain.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="smtp-pass" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="smtp-pass"
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border border-border p-3" disabled={connect.isPending}>
          <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Incoming (IMAP)
          </legend>
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div className="space-y-1.5">
              <label htmlFor="imap-host" className="text-sm font-medium">
                Host
              </label>
              <Input
                id="imap-host"
                value={imapAddress}
                onChange={(e) => setImapAddress(e.target.value)}
                placeholder="imap.yourdomain.com"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="imap-port" className="text-sm font-medium">
                Port
              </label>
              <Input
                id="imap-port"
                inputMode="numeric"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
                placeholder="993"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="imap-user" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="imap-user"
                value={imapUsername}
                onChange={(e) => setImapUsername(e.target.value)}
                placeholder="sender@yourdomain.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="imap-pass" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="imap-pass"
                type="password"
                value={imapPassword}
                onChange={(e) => setImapPassword(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        </fieldset>

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
            disabled={connect.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {connect.isPending ? 'Connecting…' : 'Connect account'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function AddMailboxDialog({ open, onOpenChange }: AddMailboxDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <AddMailboxForm onOpenChange={onOpenChange} /> : null}
    </Dialog>
  );
}

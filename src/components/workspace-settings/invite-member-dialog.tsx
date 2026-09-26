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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  WORKSPACE_ROLES,
  roleLabel,
  type InviteMemberInput,
  type WorkspaceRole,
} from '@/lib/types/workspace-member';

type InviteMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: InviteMemberInput) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
};

/** Deliberately loose — the real check is Clerk's, this only catches obvious typos. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_HINTS: Record<WorkspaceRole, string> = {
  'org:admin': 'Can manage members, invitations and workspace settings.',
  'org:member': 'Can use the workspace, but not change who belongs to it.',
};

function InviteMemberForm({
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
}: Omit<InviteMemberDialogProps, 'open'>) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('org:member');

  const trimmedEmail = email.trim();
  const canSubmit = EMAIL_PATTERN.test(trimmedEmail);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;
    await onSubmit({ emailAddress: trimmedEmail, role });
  }

  return (
    <DialogContent>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            We&rsquo;ll email an invitation. They join this workspace once they accept it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="invite-email" className="text-sm font-medium">
            Email address
          </label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@company.com"
            maxLength={255}
            disabled={isSubmitting}
            autoFocus
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            Role
          </label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as WorkspaceRole)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="invite-role" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKSPACE_ROLES.map((value) => (
                <SelectItem key={value} value={value}>
                  {roleLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
}: InviteMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <InviteMemberForm
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          error={error}
        />
      ) : null}
    </Dialog>
  );
}

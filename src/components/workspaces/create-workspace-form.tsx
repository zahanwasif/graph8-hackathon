'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateWorkspace } from '@/hooks/use-workspaces';
import { workspaceMemberErrorMessage } from '@/lib/workspace-members-format';
import type { CreatedWorkspace } from '@/lib/types/workspace-member';

type CreateWorkspaceFormProps = {
  onCreated: (workspace: CreatedWorkspace) => void;
  onCancel?: () => void;
  submitLabel?: string;
};

/** Name field + submit, shared by the onboarding card and the switcher's dialog. */
export function CreateWorkspaceForm({
  onCreated,
  onCancel,
  submitLabel = 'Create workspace',
}: CreateWorkspaceFormProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreateWorkspace();

  const trimmed = name.trim();
  const isPending = createMutation.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || isPending) return;
    setError(null);
    try {
      onCreated(await createMutation.mutateAsync({ name: trimmed }));
    } catch (err) {
      setError(workspaceMemberErrorMessage(err));
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <label htmlFor="workspace-name" className="text-sm font-medium">
          Workspace name
        </label>
        <Input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Acme Inc."
          maxLength={100}
          disabled={isPending}
          autoFocus
          required
        />
        <p className="text-xs text-muted-foreground">
          Usually your company or team name. You can invite people once it exists.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={!trimmed || isPending}>
          {isPending ? 'Creating…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

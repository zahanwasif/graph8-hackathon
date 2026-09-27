'use client';

import { useState } from 'react';
import { Hash, Plus, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useSetSlackCaptureTags } from '@/hooks/use-slack';
import { workspaceMemberErrorMessage } from '@/lib/workspace-members-format';

/** Mirrors `normalizeTag` in `src/server/slack/tags.ts`; the API is the real check. */
function normalize(input: string): string {
  return input.trim().replace(/^#+/, '').toLowerCase();
}
const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/;

type CaptureTagsEditorProps = {
  tags: string[];
  isAdmin: boolean;
};

/**
 * The hashtags that mark a Slack message for capture. Each add/remove saves immediately, the
 * same way the channel picker does — there is no separate Save step to forget.
 */
export function CaptureTagsEditor({ tags, isAdmin }: CaptureTagsEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useSetSlackCaptureTags();

  async function save(next: string[]) {
    setError(null);
    try {
      await mutation.mutateAsync(next);
      return true;
    } catch (err) {
      setError(workspaceMemberErrorMessage(err));
      return false;
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const tag = normalize(draft);
    if (!TAG_PATTERN.test(tag)) {
      setError('Use letters, numbers, - or _ (e.g. add-contact).');
      return;
    }
    if (tags.includes(tag)) {
      setDraft('');
      return;
    }
    if (await save([...tags, tag])) {
      setDraft('');
      toast.add({ title: `Capturing #${tag}`, type: 'success' });
    }
  }

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">Capture hashtags</p>
        <p className="text-xs text-muted-foreground">
          Messages with one of these tags are saved to Messages. For voice notes, the tag can be
          typed in the caption or said out loud (&ldquo;hashtag add contact&rdquo;).
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="info" className="gap-1 pr-1">
            <Hash />
            {tag}
            {isAdmin && tags.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove #${tag}`}
                disabled={mutation.isPending}
                onClick={() => void save(tags.filter((t) => t !== tag))}
                className="rounded-full p-0.5 hover:bg-info-border disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </Badge>
        ))}
      </div>

      {isAdmin ? (
        <form onSubmit={(event) => void handleAdd(event)} className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="#new-tag"
            maxLength={51}
            disabled={mutation.isPending}
            className="h-8"
            aria-label="New capture hashtag"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={!draft.trim() || mutation.isPending}
          >
            <Plus />
            Add
          </Button>
        </form>
      ) : null}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

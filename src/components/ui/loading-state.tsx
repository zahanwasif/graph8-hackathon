import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The counterpart to `EmptyState` for "not here yet, but coming". Same three shapes, same
 * placement rules, so a page doesn't jump between a bare sentence while loading and a
 * centred card once it resolves.
 *
 * Prefer `Skeleton` when the shape of the result is known (a table of rows, a stat tile) —
 * a skeleton preserves layout and this does not. Use this for whole-page and whole-panel
 * waits where there is no shape to preserve yet.
 */
function LoadingState({
  className,
  label = 'Loading…',
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & {
  label?: React.ReactNode;
  /** `sm` is an inline row; `default` centres in the available space. */
  size?: 'default' | 'sm';
}) {
  return (
    <div
      data-slot="loading-state"
      data-size={size}
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 text-sm text-muted-foreground',
        size === 'default' && 'justify-center py-10',
        className,
      )}
      {...props}
    >
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export { LoadingState };

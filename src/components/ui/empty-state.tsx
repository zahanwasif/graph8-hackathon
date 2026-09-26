import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The one empty state. Before this there were ~19 spellings across the app — dashed boxes at
 * three different radii, bare paragraphs, and `colSpan` cells with their own padding — so
 * "nothing here yet" looked like a different idea on every screen.
 *
 * The soft indigo→violet wash is what separates "nothing here yet" from "something went
 * wrong" without needing a colour word. Errors use `destructive` text; this is not that.
 *
 * Three shapes, all the same component:
 * - page / panel: the default.
 * - inside a bordered container (a table cell, a dialog): `bordered={false}`, so the
 *   container's own border isn't doubled.
 * - tight spaces (a dropdown, a sidebar panel): `size="sm"`.
 */
function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  size = 'default',
  bordered = true,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: 'default' | 'sm';
  /** Set false when the parent already draws a border (table cell, dialog body). */
  bordered?: boolean;
}) {
  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        bordered &&
          'rounded-xl border border-dashed border-border bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_70%)]',
        size === 'sm' ? 'gap-2 px-4 py-6' : 'px-6 py-10',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-primary-foreground',
            size === 'sm' ? 'size-8 [&_svg]:size-4' : 'size-10 [&_svg]:size-5',
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className={cn('font-medium text-foreground', size === 'sm' ? 'text-sm' : 'text-base')}>
          {title}
        </p>
        {description ? (
          <p className="mx-auto max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export { EmptyState };

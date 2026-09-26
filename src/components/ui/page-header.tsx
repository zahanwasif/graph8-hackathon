import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The one page heading, so every screen opens at the same scale.
 *
 * Two sizes, and the choice is structural rather than aesthetic:
 * - `default` — a top-level destination (Home, Integrations, Workspace settings).
 * - `sm` — a detail view that already carries its own chrome (a back button and tabs), where a
 *   2xl title competes with the tab row for the top of the page.
 *
 * `actions` is the right-hand slot. The primary create action of a page goes here and nowhere
 * else, so "how do I add one of these" is answered in the same place on every screen.
 */
function PageHeader({
  className,
  title,
  description,
  actions,
  back,
  size = 'default',
  loading = false,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Rendered before the title — a back link on detail pages. */
  back?: React.ReactNode;
  size?: 'default' | 'sm';
  /** Shows a skeleton in place of the title, for titles that come from the server. */
  loading?: boolean;
}) {
  return (
    <div
      data-slot="page-header"
      data-size={size}
      className={cn('flex flex-wrap items-start justify-between gap-3', className)}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-2">
        {back}
        <div className="min-w-0">
          {loading ? (
            <div
              className={cn(
                'w-48 animate-pulse rounded-md bg-muted',
                size === 'sm' ? 'h-6' : 'h-8',
              )}
            />
          ) : (
            <h1
              className={cn(
                'truncate font-semibold tracking-tight text-foreground',
                size === 'sm' ? 'text-lg' : 'text-2xl',
              )}
            >
              {title}
            </h1>
          )}
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export { PageHeader };

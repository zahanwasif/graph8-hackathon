import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border py-2 pr-2.5 pl-3 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        destructive:
          'border-danger-border bg-danger-bg text-danger-fg *:data-[slot=alert-description]:text-danger-fg/90',

        // Status variants. The left rule + a required icon are the redundant, non-colour
        // signals; never rely on the tint alone. See THEME.md.
        success:
          'border-success-border bg-success-bg text-success-fg *:data-[slot=alert-description]:text-success-fg/90',
        warning:
          'border-warning-border bg-warning-bg text-warning-fg *:data-[slot=alert-description]:text-warning-fg/90',
        info: 'border-info-border bg-info-bg text-info-fg *:data-[slot=alert-description]:text-info-fg/90',
        danger:
          'border-danger-border bg-danger-bg text-danger-fg *:data-[slot=alert-description]:text-danger-fg/90',
        neutral:
          'border-neutral-border bg-neutral-bg text-neutral-fg *:data-[slot=alert-description]:text-neutral-fg/90',
      },
      rule: {
        // 3px status-tinted left rule, drawn inside the rounded corner.
        true: 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-lg before:bg-current before:opacity-70 before:content-[""]',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      rule: false,
    },
  },
);

function Alert({
  className,
  variant,
  rule,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant, rule }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
        className,
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="alert-action" className={cn('absolute top-2 right-2', className)} {...props} />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction, alertVariants };

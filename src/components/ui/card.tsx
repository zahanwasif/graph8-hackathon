import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Any token that reads as a "hue" -- the categorical data palette, a status, or the brand.
 * Passed through as a CSS var so the accent rule stays token-driven.
 */
export type CardAccent =
  | 'primary'
  | 'violet'
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'
  | 'neutral'
  | 'chart-1'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'chart-5'
  | 'chart-6';

function Card({
  className,
  size = 'default',
  accent,
  accentSide = 'top',
  style,
  ...props
}: React.ComponentProps<'div'> & {
  size?: 'default' | 'sm';
  /** Paints a 3px rule in a categorical hue. Use it to tie a card to a metric or a status. */
  accent?: CardAccent;
  accentSide?: 'top' | 'left';
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-accent={accent}
      data-accent-side={accent ? accentSide : undefined}
      style={accent ? { ['--card-accent' as string]: `var(--${accent})`, ...style } : style}
      className={cn(
        'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground shadow-xs ring-1 ring-border [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        // The rule is a pseudo-element so it never disturbs the card's own box.
        accent &&
          'relative before:absolute before:z-10 before:bg-(--card-accent) before:content-[""]',
        accent && accentSide === 'top' && 'before:inset-x-0 before:top-0 before:h-[3px]',
        accent && accentSide === 'left' && 'before:inset-y-0 before:left-0 before:w-[3px]',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('px-(--card-spacing)', className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };

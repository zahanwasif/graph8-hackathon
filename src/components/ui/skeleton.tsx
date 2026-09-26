import { cn } from '@/lib/utils';

/**
 * Shimmer carries a faint indigo cast rather than reading as flat grey. The sweep is a
 * background-position animation, so it costs no layout and is switched off wholesale by the
 * `prefers-reduced-motion` block in globals.css.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[skeleton-shimmer_1.6s_ease-in-out_infinite] after:bg-[linear-gradient(90deg,transparent,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)] after:content-[""]',
        'motion-reduce:after:hidden',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };

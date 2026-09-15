import { cn } from '@/lib/utils';

/**
 * `motion-safe:` rather than `animate-pulse` outright: a shimmer is a comfort
 * for most people and a problem for some, and the OS already knows which.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('motion-safe:animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };

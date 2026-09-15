import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Three kinds, and the middle one carries the weight.
 *
 * `warning` is **the shop's own rule**, not a fault — a refusal, a short count,
 * something owed. Phase 6 settled that a `403` reads as amber rather than as a
 * red error with a pointless retry button, because nothing went wrong: the
 * owner decided this, and the reader needs to know who to ask.
 */
const alertVariants = cva(
  'relative flex w-full gap-3 rounded-xl border px-4 py-3 text-sm [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        info: 'border-info/25 bg-info-muted text-foreground [&>svg]:text-info',
        warning: 'border-warning-border bg-warning-muted text-warning-foreground',
        destructive: 'border-destructive/30 bg-destructive/10 text-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/**
 * **No implicit `role="alert"`.** A red alert interrupts a screen reader, and
 * most of what this component carries should not: an amber panel is the shop's
 * own rule being stated, not something going wrong. Callers that really are
 * reporting a fault pass `role="alert"` themselves.
 */
function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('font-semibold leading-snug tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-sm leading-relaxed opacity-90', className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };

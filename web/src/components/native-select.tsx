import { cn } from '@/lib/utils';

/**
 * A plain `<select>`, styled to match `Input`.
 *
 * Deliberately native rather than the Radix listbox: every one of these sits
 * inside a form posted to a server action, and a native control submits its
 * value with no JavaScript at all. On a shop's connection that is the
 * difference between a form that works and a form that looks like it does.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

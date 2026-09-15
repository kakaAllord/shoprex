'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2Icon, CircleAlertIcon, Loader2Icon } from 'lucide-react';
import { IDLE, type ActionState } from '@/lib/action-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function SubmitButton({
  label,
  busyLabel,
  variant,
  confirm,
}: {
  label: string;
  busyLabel: string;
  variant?: 'quiet' | 'danger';
  confirm?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size={variant ? 'sm' : 'default'}
      variant={variant === 'danger' ? 'destructive' : variant === 'quiet' ? 'outline' : 'default'}
      disabled={pending}
      // Revoking a phone and discontinuing a product are both easy to click by
      // accident and awkward to undo in a shop. Neither is destructive to
      // history, so a confirm is enough - nothing here needs a modal.
      onClick={
        confirm
          ? (event) => {
              if (!window.confirm(confirm)) {
                event.preventDefault();
              }
            }
          : undefined
      }
    >
      {pending ? <Loader2Icon className="motion-safe:animate-spin" /> : null}
      {pending ? busyLabel : label}
    </Button>
  );
}

/**
 * A form wired to one server action, with its own success and failure lines.
 *
 * Every write in this console goes through one of these, so a failure always
 * lands next to the thing that failed rather than in a banner at the top of
 * the page, and no form ever reports a success the backend did not give it.
 */
export function ActionForm({
  action,
  label,
  busyLabel,
  variant,
  confirm,
  inline,
  className,
  children,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  label: string;
  busyLabel?: string;
  variant?: 'quiet' | 'danger';
  confirm?: string;
  /** Lay the fields and the button out on one row. */
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, IDLE);

  return (
    <form action={formAction} className={cn('flex flex-col gap-3', className)}>
      <div
        className={
          inline
            ? 'flex flex-wrap items-end gap-2'
            : 'flex flex-col gap-3 [&>*:last-child]:self-start'
        }
      >
        {children}
        <SubmitButton
          label={label}
          busyLabel={busyLabel ?? 'Inatuma...'}
          variant={variant}
          confirm={confirm}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-success/25 bg-success-muted px-3 py-2 text-sm text-success-foreground"
        >
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { IDLE, type ActionState } from '../lib/action-state';

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

  const className = [
    'shoprex-button',
    variant === 'quiet' ? 'shoprex-button--quiet' : '',
    variant === 'danger' ? 'shoprex-button--danger' : '',
    variant ? 'shoprex-button--small' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="submit"
      className={className}
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
      {pending ? busyLabel : label}
    </button>
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
  children,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  label: string;
  busyLabel?: string;
  variant?: 'quiet' | 'danger';
  confirm?: string;
  /** Lay the fields and the button out on one row. */
  inline?: boolean;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, IDLE);

  return (
    <form action={formAction}>
      <div className={inline ? 'shoprex-inlineform' : undefined}>
        {children}
        <SubmitButton
          label={label}
          busyLabel={busyLabel ?? 'Inatuma...'}
          variant={variant}
          confirm={confirm}
        />
      </div>

      {state.error ? (
        <p className="shoprex-alert" role="alert" style={{ marginTop: 12 }}>
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p className="shoprex-ok" role="status" style={{ marginTop: 12 }}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

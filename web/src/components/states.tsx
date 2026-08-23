import type { ReactNode } from 'react';
import { ShoprexApiError } from '../lib/api/client';

/**
 * The states nobody looks at until they happen.
 *
 * Empty, error, and permission-denied are written once here so every screen
 * shows the same thing, and so that "the branch has nothing in it" never
 * renders as a blank rectangle somebody reads as a broken page.
 */

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="shoprex-state">
      <p className="shoprex-state__title">{title}</p>
      {hint ? <p className="shoprex-state__hint">{hint}</p> : null}
    </div>
  );
}

/**
 * Something went wrong, said in terms of what the reader can do next.
 *
 * A **403 is not an error** and is not shown as one: it means the shop's own
 * rules say this person may not see this, which is a sentence, not a fault.
 * Offering a retry there would keep answering the same way.
 */
export function ErrorState({ error, retryHref }: { error: unknown; retryHref?: string }) {
  if (error instanceof ShoprexApiError && error.status === 403) {
    return (
      <div className="shoprex-state shoprex-state--denied">
        <p className="shoprex-state__title">Huna ruhusa · You do not have permission</p>
        <p className="shoprex-state__hint">{error.message}</p>
        <p className="shoprex-state__hint">
          Mmiliki wa duka ndiye anayetoa ruhusa hii · The shop owner grants this.
        </p>
      </div>
    );
  }

  const message =
    error instanceof ShoprexApiError
      ? error.message
      : 'Seva haipatikani · Shoprex could not reach the backend.';

  return (
    <div className="shoprex-state shoprex-state--error" role="alert">
      <p className="shoprex-state__title">Kuna hitilafu · Something went wrong</p>
      <p className="shoprex-state__hint">{message}</p>
      {retryHref ? (
        <a className="shoprex-linkbutton" href={retryHref}>
          Jaribu tena · Try again
        </a>
      ) : null}
    </div>
  );
}

/**
 * What a manager sees where an owner sees a form.
 *
 * Deliberately a sentence naming who can do it, not a disabled button. The
 * backend refuses the action regardless; this is about whether the person
 * reading it learns anything.
 */
export function OwnerOnlyNote({ what }: { what: string }) {
  return (
    <p className="shoprex-note shoprex-note--owner">
      {what} hufanywa na mmiliki wa duka · Only the shop owner can do this.
    </p>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="shoprex-card">
      <div className="shoprex-card__head">
        <h2 className="shoprex-card__title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

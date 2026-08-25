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
 * The state this file used to be missing, and the one a pilot shop meets most.
 *
 * Every console screen is a server component that awaits the backend before it
 * renders anything, so on a slow connection the browser sat on the *previous*
 * page with no indication that anything was happening — the reader's only
 * feedback was that clicking had apparently done nothing, which invites them
 * to click again. Next renders a segment's `loading.tsx` the instant a
 * navigation starts, and this is what those render.
 *
 * `rows` draws the shape of the table that is coming rather than a spinner, so
 * the page does not jump when the real content lands.
 */
export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="shoprex-loading" role="status" aria-live="polite">
      <p className="shoprex-loading__label">{label}</p>
      <div className="shoprex-loading__bars" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <span key={index} className="shoprex-loading__bar" />
        ))}
      </div>
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

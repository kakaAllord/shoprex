'use client';

import { useEffect } from 'react';

/**
 * The last thing standing between an unhandled exception and a stack trace.
 *
 * Without this file Next renders its own error screen: English, developer
 * -shaped, and in production a bare "Application error: a client-side
 * exception has occurred" that tells a shopkeeper nothing and tells an
 * attacker slightly more than nothing.
 *
 * Screens that *expect* a failure — a backend that refuses, a permission the
 * caller lacks — still handle it themselves with `ErrorState`, and should:
 * they know what the reader was trying to do. This is only for the failures
 * nobody anticipated, so it deliberately says little and offers the two moves
 * that ever help: try again, or go back to somewhere that works.
 *
 * A client component, because an error boundary has to be. `reset()` re-runs
 * the failed render, which is the right first move for a transient fault and
 * harmless for a permanent one.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side digests are the only handle on what actually happened once
    // this is deployed, so keep it where somebody debugging can find it.
    console.error('Shoprex console error', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="shoprex-shell">
      <div className="shoprex-state shoprex-state--error" role="alert">
        <p className="shoprex-state__title">Kuna hitilafu · Something went wrong</p>
        <p className="shoprex-state__hint">
          Shoprex haikuweza kuonyesha ukurasa huu · Shoprex could not display this page. Hakuna
          taarifa iliyopotea · Nothing you saved has been lost.
        </p>
        {error.digest ? (
          <p className="shoprex-state__hint">
            Namba ya hitilafu · Reference: <code>{error.digest}</code>
          </p>
        ) : null}
        <div className="shoprex-state__actions">
          <button type="button" className="shoprex-linkbutton" onClick={reset}>
            Jaribu tena · Try again
          </button>
          <a className="shoprex-linkbutton" href="/">
            Rudi mwanzo · Back to the start
          </a>
        </div>
      </div>
    </main>
  );
}

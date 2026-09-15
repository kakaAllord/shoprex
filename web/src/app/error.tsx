'use client';

import { useEffect } from 'react';
import { AlertCircleIcon, HomeIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md" role="alert">
        <CardContent className="flex flex-col items-start gap-3 pt-6">
          <AlertCircleIcon className="size-5 text-destructive" aria-hidden="true" />

          <p className="text-base font-semibold">Kuna hitilafu · Something went wrong</p>

          <p className="text-sm text-muted-foreground">
            Shoprex haikuweza kuonyesha ukurasa huu · Shoprex could not display this page. Hakuna
            taarifa iliyopotea · Nothing you saved has been lost.
          </p>

          {error.digest ? (
            <p className="text-xs text-muted-foreground">
              Namba ya hitilafu · Reference:{' '}
              <code className="rounded bg-muted px-1 py-0.5">{error.digest}</code>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <RefreshCwIcon />
              Jaribu tena · Try again
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="/">
                <HomeIcon />
                Rudi mwanzo · Back to the start
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

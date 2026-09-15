import { CompassIcon, HomeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A page that is not there.
 *
 * Reached by a mistyped address, a stale bookmark, or a `notFound()` from a
 * screen whose record no longer exists. Next's default is an unstyled English
 * "404 — This page could not be found", which in a Swahili-first console reads
 * as the application having broken rather than as a wrong address.
 *
 * Not dressed in red, deliberately: a wrong turn is not a fault. And no retry,
 * because retrying an address that does not exist answers the same way. The
 * only useful move is somewhere that does exist, and `/` already knows which
 * console the reader belongs to.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-start gap-3 pt-6">
          <CompassIcon className="size-5 text-muted-foreground" aria-hidden="true" />

          <p className="text-base font-semibold">Ukurasa haupo · This page does not exist</p>

          <p className="text-sm text-muted-foreground">
            Anwani hii si sahihi, au kitu ulichokuwa unatafuta kimeondolewa · The address is wrong,
            or what it pointed at has been removed.
          </p>

          <Button asChild variant="outline" size="sm" className="mt-1">
            <a href="/">
              <HomeIcon />
              Rudi mwanzo · Back to the start
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

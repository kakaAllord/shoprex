import type { ReactNode } from 'react';
import {
  AlertCircleIcon,
  InboxIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import Link from 'next/link';
import { ShoprexApiError } from '@/lib/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The states nobody looks at until they happen.
 *
 * Empty, loading, error, and permission-denied are written once here so every
 * screen shows the same thing, and so that "the branch has nothing in it"
 * never renders as a blank rectangle somebody reads as a broken page.
 */

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <InboxIcon className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-prose text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
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
    <Card role="status" aria-live="polite">
      <CardHeader>
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-4" style={{ width: `${92 - index * 13}%` }} />
        ))}
      </CardContent>
    </Card>
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
      <Alert variant="warning">
        <ShieldAlertIcon />
        <div className="flex flex-col gap-1">
          <AlertTitle>Huna ruhusa · You do not have permission</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
          <AlertDescription>
            Mmiliki wa duka ndiye anayetoa ruhusa hii · The shop owner grants this.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  const message =
    error instanceof ShoprexApiError
      ? error.message
      : 'Seva haipatikani · Shoprex could not reach the backend.';

  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon />
      <div className="flex flex-col items-start gap-2">
        <AlertTitle>Kuna hitilafu · Something went wrong</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
        {retryHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={retryHref}>
              <RefreshCwIcon />
              Jaribu tena · Try again
            </Link>
          </Button>
        ) : null}
      </div>
    </Alert>
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
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
      {what} hufanywa na mmiliki wa duka · Only the shop owner can do this.
    </p>
  );
}

/** A titled section. Kept as `Panel` so every screen did not have to change at once. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="relative flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

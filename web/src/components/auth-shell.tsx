import type { ReactNode } from 'react';
import { StoreIcon } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The frame for the two pages you can reach without an account.
 *
 * No sidebar and no navigation: there is nowhere else to go from here, and a
 * disabled-looking nav on a sign-in page is just noise between a shopkeeper
 * and their shop.
 */
export function AuthShell({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-5 px-4 py-10">
      <div className="flex w-full max-w-md items-center justify-between">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <StoreIcon className="size-4" />
          </span>
          Shoprex
        </span>
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          {lede ? <CardDescription className="text-sm">{lede}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      {footer ? <div className="w-full max-w-md">{footer}</div> : null}
    </main>
  );
}

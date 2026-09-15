import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import type { AuthProfile } from '@/lib/api/auth';
import { ConsoleSidebar } from '@/components/console-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { SidebarInset, SidebarProvider, SidebarTrigger, SIDEBAR_COOKIE } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

/**
 * Every console page in one frame: who is signed in, where they are, and what
 * this screen is for.
 *
 * `current` is passed rather than read from the router because these are
 * server components — a client component reading `usePathname` would drag the
 * whole shell across the boundary for the sake of marking one nav item.
 *
 * The sidebar's collapsed state is read from its cookie **here**, on the
 * server, so the first paint is already the width the reader left it at.
 */
export async function ConsoleShell({
  profile,
  current,
  title,
  lede,
  actions,
  children,
}: {
  profile: AuthProfile;
  current: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const store = await cookies();
  const defaultOpen = store.get(SIDEBAR_COOKIE)?.value !== 'false';

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <ConsoleSidebar profile={profile} current={current} />

      <SidebarInset>
        <header className="sticky top-0 z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />

          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-base font-semibold leading-tight tracking-tight">
              {title}
            </h1>
            {lede ? (
              <p className="line-clamp-1 text-xs text-muted-foreground">{lede}</p>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {actions}
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

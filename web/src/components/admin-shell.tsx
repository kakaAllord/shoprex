import type { ReactNode } from 'react';
import { ShieldCheckIcon } from 'lucide-react';
import type { AuthProfile } from '@/lib/api/auth';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The platform administrator's frame.
 *
 * No sidebar, because there is exactly one screen: a nav listing one
 * destination teaches nothing and takes 256px to say it. If the admin console
 * ever grows a second page, this becomes `ConsoleShell` with its own nav.
 *
 * It is visibly *not* the owner console — an administrator acting on somebody
 * else's shop should never be one glance away from thinking it is their own.
 */
export function AdminShell({
  profile,
  title,
  lede,
  children,
}: {
  profile: AuthProfile;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3 md:px-6">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
            <ShieldCheckIcon className="size-4" />
          </span>
          Shoprex
        </span>

        <Badge variant="secondary">Msimamizi wa jukwaa · Platform admin</Badge>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-full">
                <Avatar className="size-7">
                  <AvatarFallback>{profile.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="sr-only">{profile.fullName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-sm font-semibold text-foreground">
                  {profile.fullName}
                </span>
                <span className="block text-xs text-muted-foreground">{profile.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <SignOutButton />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {lede ? <p className="max-w-prose text-sm text-muted-foreground">{lede}</p> : null}
        </div>

        {children}
      </div>
    </main>
  );
}

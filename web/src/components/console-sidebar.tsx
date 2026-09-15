'use client';

import { ChevronsUpDownIcon, StoreIcon } from 'lucide-react';
import type { AuthProfile, UserRole } from '@/lib/api/auth';
import { ConsoleNav } from '@/components/console-nav';
import { SignOutButton } from '@/components/sign-out-button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

/** What Shoprex calls each role, to its face. */
const ROLE_LABELS: Record<UserRole, string> = {
  PLATFORM_ADMIN: 'Msimamizi wa jukwaa',
  OWNER: 'Mmiliki',
  MANAGER: 'Meneja',
  WORKER: 'Mfanyakazi',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function ConsoleSidebar({
  profile,
  current,
}: {
  profile: AuthProfile;
  current: string;
}) {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-auto py-2 text-sidebar-foreground hover:bg-transparent"
              tooltip={profile.businessName ?? 'Shoprex'}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <StoreIcon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold leading-tight">
                  {profile.businessName ?? 'Shoprex'}
                </span>
                <span className="truncate text-xs leading-tight text-sidebar-foreground/60">
                  {ROLE_LABELS[profile.role]}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <ConsoleNav profile={profile} current={current} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-auto py-2" tooltip={profile.fullName}>
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                      {initialsOf(profile.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm leading-tight">{profile.fullName}</span>
                    <span className="truncate text-xs leading-tight text-sidebar-foreground/60">
                      {profile.email ?? ROLE_LABELS[profile.role]}
                    </span>
                  </span>
                  <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm font-semibold text-foreground">
                    {profile.fullName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {profile.email ?? ROLE_LABELS[profile.role]}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <SignOutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

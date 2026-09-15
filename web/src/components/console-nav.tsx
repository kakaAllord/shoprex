'use client';

import Link from 'next/link';
import {
  BarChart3Icon,
  CreditCardIcon,
  LayoutGridIcon,
  PackageIcon,
  ReceiptIcon,
  SmartphoneIcon,
  StoreIcon,
  TagIcon,
  UsersIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AuthProfile } from '@/lib/api/auth';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

interface NavItem {
  href: string;
  /** Swahili is the label; the console is Swahili-first and the sidebar is narrow. */
  label: string;
  /** The English word, kept for the tooltip and the screen reader. */
  english: string;
  icon: LucideIcon;
  /** Owner-only destinations are simply absent for a manager, never dimmed. */
  ownerOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Nine flat destinations was too many to scan, so they are two groups: what a
 * shop *does* every day, and what an owner *sets up* occasionally.
 */
const OWNER_NAV: NavGroup[] = [
  {
    label: 'Duka',
    items: [
      { href: '/owner', label: 'Muhtasari', english: 'Overview', icon: LayoutGridIcon },
      { href: '/owner/reports', label: 'Ripoti', english: 'Reports', icon: BarChart3Icon },
      { href: '/owner/sales', label: 'Mauzo', english: 'Sales', icon: ReceiptIcon },
      { href: '/owner/stock', label: 'Stoo', english: 'Stock', icon: PackageIcon },
      { href: '/owner/products', label: 'Bidhaa', english: 'Products', icon: TagIcon },
    ],
  },
  {
    label: 'Usimamizi',
    items: [
      { href: '/owner/branches', label: 'Matawi', english: 'Branches', icon: StoreIcon, ownerOnly: true },
      { href: '/owner/staff', label: 'Wafanyakazi', english: 'Staff', icon: UsersIcon },
      { href: '/owner/devices', label: 'Simu', english: 'Devices', icon: SmartphoneIcon },
      { href: '/owner/payment-methods', label: 'Malipo', english: 'Payments', icon: CreditCardIcon, ownerOnly: true },
    ],
  },
];

/**
 * The console's own navigation.
 *
 * A manager is shown fewer doors rather than the same doors greyed out. A
 * dimmed control teaches somebody that Shoprex is broken; an absent one,
 * paired with the written explanation each owner-only page carries, teaches
 * them who to ask. The backend refuses the action either way — this is
 * courtesy, not authorization.
 */
export function ConsoleNav({ profile, current }: { profile: AuthProfile; current: string }) {
  const isOwner = profile.role === 'OWNER';

  return (
    <>
      {OWNER_NAV.map((group) => {
        const items = group.items.filter((item) => isOwner || !item.ownerOnly);

        if (items.length === 0) {
          return null;
        }

        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.href === current;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={`${item.label} · ${item.english}`}
                    >
                      <Link href={item.href} aria-current={active ? 'page' : undefined}>
                        <item.icon />
                        <span>{item.label}</span>
                        <span className="sr-only">{item.english}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}
    </>
  );
}

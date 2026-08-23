import Link from 'next/link';
import type { AuthProfile } from '../lib/api/auth';

interface NavItem {
  href: string;
  label: string;
  /** Owner-only destinations are simply absent for a manager, never dimmed. */
  ownerOnly?: boolean;
}

const OWNER_NAV: NavItem[] = [
  { href: '/owner', label: 'Muhtasari · Overview' },
  { href: '/owner/sales', label: 'Mauzo · Sales' },
  { href: '/owner/stock', label: 'Stoo · Stock' },
  { href: '/owner/products', label: 'Bidhaa · Products' },
  { href: '/owner/branches', label: 'Matawi · Branches', ownerOnly: true },
  { href: '/owner/staff', label: 'Wafanyakazi · Staff' },
  { href: '/owner/devices', label: 'Simu · Devices' },
  { href: '/owner/payment-methods', label: 'Malipo · Payments', ownerOnly: true },
];

/**
 * The console's own navigation.
 *
 * A manager is shown fewer doors rather than the same doors greyed out. A
 * dimmed control teaches somebody that Shoprex is broken; an absent one, paired
 * with the written explanation each owner-only page carries, teaches them who
 * to ask. The backend refuses the action either way — this is courtesy, not
 * authorization.
 */
export function ConsoleNav({
  profile,
  current,
}: {
  profile: AuthProfile;
  current: string;
}) {
  const isOwner = profile.role === 'OWNER';
  const items = OWNER_NAV.filter((item) => isOwner || !item.ownerOnly);

  return (
    <nav className="shoprex-nav" aria-label="Shoprex console">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            item.href === current ? 'shoprex-nav__link shoprex-nav__link--on' : 'shoprex-nav__link'
          }
          aria-current={item.href === current ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

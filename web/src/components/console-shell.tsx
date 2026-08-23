import type { ReactNode } from 'react';
import type { AuthProfile } from '../lib/api/auth';
import { ConsoleHeader } from './console-header';
import { ConsoleNav } from './console-nav';

/**
 * Every console page in one frame: who is signed in, where they are, and what
 * this screen is for.
 *
 * `current` is passed rather than read from the router because these are
 * server components — a client component reading `usePathname` would drag the
 * whole shell across the boundary for the sake of underlining one link.
 */
export function ConsoleShell({
  profile,
  current,
  title,
  lede,
  children,
}: {
  profile: AuthProfile;
  current: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <main className="shoprex-shell shoprex-shell--wide">
      <ConsoleHeader profile={profile} />
      <ConsoleNav profile={profile} current={current} />

      <h1 className="shoprex-title">{title}</h1>
      {lede ? <p className="shoprex-lede">{lede}</p> : null}

      {children}
    </main>
  );
}

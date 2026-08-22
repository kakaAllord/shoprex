import type { AuthProfile } from '../lib/api/auth';
import { SignOutButton } from './sign-out-button';

/** Identity strip shown at the top of both consoles. */
export function ConsoleHeader({ profile }: { profile: AuthProfile }) {
  const isAdmin = profile.console === 'admin';

  return (
    <header className="shoprex-header">
      <span className="shoprex-brand">
        <span className="shoprex-brand__mark" aria-hidden="true">
          D
        </span>
        Shoprex
      </span>

      <div className="shoprex-header__right">
        <span className={isAdmin ? 'shoprex-phase' : 'shoprex-status shoprex-status--ok'}>
          {isAdmin ? 'Msimamizi wa jukwaa · Platform admin' : 'Mmiliki · Owner'}
        </span>
        <span className="shoprex-header__user">
          {profile.fullName}
          <span className="shoprex-header__email">{profile.email}</span>
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}

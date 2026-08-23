import type { AuthProfile, UserRole } from '../lib/api/auth';
import { SignOutButton } from './sign-out-button';

/** What Shoprex calls each role, to its face. */
const ROLE_LABELS: Record<UserRole, string> = {
  PLATFORM_ADMIN: 'Msimamizi wa jukwaa · Platform admin',
  OWNER: 'Mmiliki · Owner',
  MANAGER: 'Meneja · Manager',
  WORKER: 'Mfanyakazi · Worker',
};

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
          {ROLE_LABELS[profile.role]}
        </span>
        <span className="shoprex-header__user">
          {profile.fullName}
          <span className="shoprex-header__email">
            {profile.email ?? profile.businessName ?? ''}
          </span>
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}

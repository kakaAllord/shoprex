import { redirect } from 'next/navigation';
import { SignupForm } from '../../components/signup-form';
import { consolePath } from '../../lib/api/auth';
import { fetchBackendHealth } from '../../lib/api/health';
import { currentProfile } from '../../lib/api/session';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const profile = await currentProfile();

  if (profile) {
    redirect(consolePath(profile.console));
  }

  const health = await fetchBackendHealth();

  return (
    <main className="shoprex-shell shoprex-shell--narrow">
      <span className="shoprex-brand">
        <span className="shoprex-brand__mark" aria-hidden="true">
          D
        </span>
        Shoprex
      </span>

      <h1 className="shoprex-title">Fungua duka lako</h1>
      <p className="shoprex-lede">
        Jisajili mwenyewe kwa dakika moja. Baada ya kufungua duka, unaweza kuongeza
        matawi na wafanyakazi. Open your own shop in a minute — branches and workers
        come next.
      </p>

      {!health.reachable ? (
        <p className="shoprex-alert" role="alert">
          Seva haipatikani · Backend unreachable. Anzisha <code>npm run start:dev</code>{' '}
          ndani ya <code>backend/</code>.
        </p>
      ) : null}

      <section className="shoprex-card">
        <SignupForm />
      </section>
    </main>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '../../components/login-form';
import { consolePath, fetchDevCredentials } from '../../lib/api/auth';
import { currentProfile } from '../../lib/api/session';
import { fetchBackendHealth } from '../../lib/api/health';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  const { problem } = await searchParams;

  // Already signed in? Go straight to the console this account belongs to.
  // A backend that cannot answer is not a sign-out, so it is not fatal here
  // either: fall through and show the form with an explanation.
  let profile = null;

  try {
    profile = await currentProfile();
  } catch {
    profile = null;
  }

  if (profile) {
    redirect(consolePath(profile.console));
  }

  const [devCredentials, health] = await Promise.all([
    fetchDevCredentials(),
    fetchBackendHealth(),
  ]);

  return (
    <main className="shoprex-shell shoprex-shell--narrow">
      <span className="shoprex-brand">
        <span className="shoprex-brand__mark" aria-hidden="true">
          D
        </span>
        Shoprex
      </span>

      <h1 className="shoprex-title">Ingia</h1>
      <p className="shoprex-lede">
        Weka barua pepe na nenosiri lako. Shoprex itakupeleka kwenye eneo lako lako
        moja kwa moja. Sign in and Shoprex sends you to the right console
        automatically.
      </p>

      {!health.reachable ? (
        <p className="shoprex-alert" role="alert">
          Seva haipatikani · Backend unreachable. Anzisha <code>npm run start:dev</code>{' '}
          ndani ya <code>backend/</code>.
        </p>
      ) : problem === 'backend' ? (
        <p className="shoprex-alert" role="alert">
          Shoprex haikuweza kuthibitisha kipindi chako kwa sasa — si nenosiri lako.
          Jaribu tena baada ya muda mfupi. Shoprex could not confirm your session just
          now. That is not your password — try again shortly.
        </p>
      ) : null}

      <section className="shoprex-card">
        <LoginForm devCredentials={devCredentials} />
      </section>

      <p className="shoprex-note">
        Huna akaunti? <Link href="/signup">Fungua duka lako · Create a shop</Link>
      </p>
    </main>
  );
}

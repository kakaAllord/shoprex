import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleAlertIcon } from 'lucide-react';
import { LoginForm } from '@/components/login-form';
import { AuthShell } from '@/components/auth-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { consolePath, fetchDevCredentials } from '@/lib/api/auth';
import { currentProfile } from '@/lib/api/session';
import { fetchBackendHealth } from '@/lib/api/health';

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
    <AuthShell
      title="Ingia"
      lede="Weka barua pepe na nenosiri lako. Shoprex itakupeleka kwenye eneo lako moja kwa moja. Sign in and Shoprex sends you to the right console automatically."
      footer={
        <p className="text-center text-xs text-muted-foreground">
          Huna akaunti?{' '}
          <Link
            href="/signup"
            className="font-medium text-info underline-offset-4 hover:underline"
          >
            Fungua duka lako · Create a shop
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        {!health.reachable ? (
          <Alert variant="destructive" role="alert">
            <CircleAlertIcon />
            <AlertDescription>
              Seva haipatikani · Backend unreachable. Anzisha{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run start:dev</code> ndani
              ya <code className="rounded bg-muted px-1 py-0.5 text-xs">backend/</code>.
            </AlertDescription>
          </Alert>
        ) : problem === 'backend' ? (
          <Alert variant="warning">
            <CircleAlertIcon />
            <AlertDescription>
              Shoprex haikuweza kuthibitisha kipindi chako kwa sasa — si nenosiri lako. Jaribu tena
              baada ya muda mfupi. Shoprex could not confirm your session just now. That is not your
              password — try again shortly.
            </AlertDescription>
          </Alert>
        ) : null}

        <LoginForm devCredentials={devCredentials} />
      </div>
    </AuthShell>
  );
}

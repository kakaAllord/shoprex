import { redirect } from 'next/navigation';
import { CircleAlertIcon } from 'lucide-react';
import { SignupForm } from '@/components/signup-form';
import { AuthShell } from '@/components/auth-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { consolePath } from '@/lib/api/auth';
import { fetchBackendHealth } from '@/lib/api/health';
import { currentProfile } from '@/lib/api/session';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const profile = await currentProfile();

  if (profile) {
    redirect(consolePath(profile.console));
  }

  const health = await fetchBackendHealth();

  return (
    <AuthShell
      title="Fungua duka lako"
      lede="Jisajili mwenyewe kwa dakika moja. Baada ya kufungua duka, unaweza kuongeza matawi na wafanyakazi. Open your own shop in a minute — branches and workers come next."
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
        ) : null}

        <SignupForm />
      </div>
    </AuthShell>
  );
}

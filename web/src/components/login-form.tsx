'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CircleAlertIcon } from 'lucide-react';
import type { DevCredential } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/field';
import { cn } from '@/lib/utils';

/**
 * Email and password sign-in.
 *
 * In development the form arrives already filled with a seeded account, so
 * testing needs no typing. The list is empty in any deployed environment
 * because the backend refuses to serve it there.
 */
export function LoginForm({ devCredentials }: { devCredentials: DevCredential[] }) {
  const router = useRouter();
  const [email, setEmail] = useState(devCredentials[0]?.email ?? '');
  const [password, setPassword] = useState(devCredentials[0]?.password ?? '');
  const [activeAccount, setActiveAccount] = useState(devCredentials[0]?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Keep the prefill in step if the seeded accounts change between reloads.
  useEffect(() => {
    if (devCredentials.length > 0 && email === '') {
      setEmail(devCredentials[0].email);
      setPassword(devCredentials[0].password);
      setActiveAccount(devCredentials[0].email);
    }
  }, [devCredentials, email]);

  function useAccount(credential: DevCredential) {
    setEmail(credential.email);
    setPassword(credential.password);
    setActiveAccount(credential.email);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.message ?? 'Kuingia kumeshindikana · Sign-in failed');
        return;
      }

      // The backend decides which console this account belongs to.
      router.replace(payload.redirectTo);
      router.refresh();
    } catch {
      setError('Seva haipatikani · Backend unreachable');
    } finally {
      setSubmitting(false);
    }
  }

  // `method="post"` on a form this component submits with JavaScript is not
  // redundant, and it is not about the happy path.
  //
  // A form with neither a method nor an action submits natively as a **GET to
  // the current URL** — which is what happens if a click lands before React has
  // hydrated, or if the bundle fails to load at all. The browser then puts every
  // field in the query string, so the password ends up in the address bar, in
  // browser history, in the server's access log, and in the `Referer` of the
  // next request. It was observed doing exactly that: `GET /login?email=...&password=...`.
  //
  // Declaring POST cannot leak a credential into a URL. The request still fails
  // — this route serves no POST — and that is the correct outcome: the seller
  // sees the page again rather than a password in their history.
  return (
    <form method="post" onSubmit={handleSubmit} className="flex flex-col gap-4">
      {devCredentials.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/50 p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            Akaunti za majaribio · Development accounts
          </p>
          <div className="flex flex-wrap gap-1.5">
            {devCredentials.map((credential) => (
              <button
                key={credential.email}
                type="button"
                onClick={() => useAccount(credential)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  activeAccount === credential.email
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent',
                )}
              >
                {credential.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Fomu imejazwa tayari. Bonyeza Ingia. The form is prefilled — just press sign in.
          </p>
        </div>
      ) : null}

      <Field htmlFor="email" label="Barua pepe · Email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field htmlFor="password" label="Nenosiri · Password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Inaingia...' : 'Ingia · Sign in'}
      </Button>
    </form>
  );
}

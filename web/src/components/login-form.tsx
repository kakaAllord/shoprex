'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DevCredential } from '../lib/api/auth';

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

  return (
    <form onSubmit={handleSubmit} className="shoprex-form">
      {devCredentials.length > 0 ? (
        <div className="shoprex-devbox">
          <p className="shoprex-devbox__title">
            Akaunti za majaribio · Development accounts
          </p>
          <div className="shoprex-devbox__choices">
            {devCredentials.map((credential) => (
              <button
                key={credential.email}
                type="button"
                onClick={() => useAccount(credential)}
                className={
                  activeAccount === credential.email
                    ? 'shoprex-chip shoprex-chip--active'
                    : 'shoprex-chip'
                }
              >
                {credential.label}
              </button>
            ))}
          </div>
          <p className="shoprex-note">
            Fomu imejazwa tayari. Bonyeza Ingia. The form is prefilled — just press
            sign in.
          </p>
        </div>
      ) : null}

      <label className="shoprex-label" htmlFor="email">
        Barua pepe · Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        className="shoprex-input"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <label className="shoprex-label" htmlFor="password">
        Nenosiri · Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        minLength={8}
        className="shoprex-input"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error ? (
        <p className="shoprex-alert" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="shoprex-button" disabled={submitting}>
        {submitting ? 'Inaingia...' : 'Ingia · Sign in'}
      </button>
    </form>
  );
}

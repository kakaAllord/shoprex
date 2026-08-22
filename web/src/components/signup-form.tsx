'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Owner self-registration.
 *
 * Four fields open a shop: shop name, email, phone, password. The display
 * name is optional and defaults to the email name on the backend, so nothing
 * stands between a shopkeeper and their first sale.
 */
export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    shopName: '',
    email: '',
    phone: '',
    password: '',
    fullName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(
          Array.isArray(payload.message)
            ? payload.message.join(' · ')
            : (payload.message ?? 'Usajili umeshindikana · Sign-up failed'),
        );
        return;
      }

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
      <label className="shoprex-label" htmlFor="shopName">
        Jina la duka · Shop name
      </label>
      <input
        id="shopName"
        name="shopName"
        type="text"
        required
        minLength={2}
        className="shoprex-input"
        placeholder="Duka la Mama Anna"
        value={form.shopName}
        onChange={update('shopName')}
      />

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
        value={form.email}
        onChange={update('email')}
      />

      <label className="shoprex-label" htmlFor="phone">
        Namba ya simu · Phone
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        required
        className="shoprex-input"
        placeholder="0712 345 678"
        value={form.phone}
        onChange={update('phone')}
      />

      <label className="shoprex-label" htmlFor="password">
        Nenosiri · Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        className="shoprex-input"
        value={form.password}
        onChange={update('password')}
      />

      <label className="shoprex-label" htmlFor="fullName">
        Jina lako · Your name <span className="shoprex-optional">(si lazima · optional)</span>
      </label>
      <input
        id="fullName"
        name="fullName"
        type="text"
        autoComplete="name"
        className="shoprex-input"
        value={form.fullName}
        onChange={update('fullName')}
      />

      {error ? (
        <p className="shoprex-alert" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="shoprex-button" disabled={submitting}>
        {submitting ? 'Inasajili...' : 'Fungua duka · Create shop'}
      </button>

      <p className="shoprex-note">
        Una akaunti tayari? <Link href="/login">Ingia hapa · Sign in</Link>
      </p>
    </form>
  );
}

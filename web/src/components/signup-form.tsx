'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CircleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/field';

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field htmlFor="shopName" label="Jina la duka · Shop name">
        <Input
          id="shopName"
          name="shopName"
          type="text"
          required
          minLength={2}
          placeholder="Duka la Mama Anna"
          value={form.shopName}
          onChange={update('shopName')}
        />
      </Field>

      <Field htmlFor="email" label="Barua pepe · Email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={form.email}
          onChange={update('email')}
        />
      </Field>

      <Field htmlFor="phone" label="Namba ya simu · Phone">
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          placeholder="0712 345 678"
          value={form.phone}
          onChange={update('phone')}
        />
      </Field>

      <Field htmlFor="password" label="Nenosiri · Password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={update('password')}
        />
      </Field>

      <Field
        htmlFor="fullName"
        label="Jina lako · Your name"
        hint="Si lazima · optional — tutatumia jina la barua pepe."
      >
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          value={form.fullName}
          onChange={update('fullName')}
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
        {submitting ? 'Inasajili...' : 'Fungua duka · Create shop'}
      </Button>

      <p className="text-xs text-muted-foreground">
        Una akaunti tayari?{' '}
        <Link href="/login" className="font-medium text-info underline-offset-4 hover:underline">
          Ingia hapa · Sign in
        </Link>
      </p>
    </form>
  );
}

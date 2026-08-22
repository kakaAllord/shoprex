// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';
import type { DevCredential } from '../lib/api/auth';

const replace = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

const devCredentials: DevCredential[] = [
  {
    label: 'Msimamizi wa Shoprex · Platform admin',
    email: 'admin@shoprex.co.tz',
    password: 'shoprex12345',
    role: 'PLATFORM_ADMIN',
  },
  {
    label: 'Mmiliki · Owner (Duka la Mfano)',
    email: 'owner@shoprex.co.tz',
    password: 'shoprex12345',
    role: 'OWNER',
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  replace.mockClear();
  refresh.mockClear();
});

describe('LoginForm', () => {
  it('arrives prefilled with the first development account', () => {
    render(<LoginForm devCredentials={devCredentials} />);

    expect(screen.getByLabelText(/Email/i)).toHaveValue('admin@shoprex.co.tz');
    expect(screen.getByLabelText(/Password/i)).toHaveValue('shoprex12345');
  });

  it('switches the prefill when another development account is chosen', () => {
    render(<LoginForm devCredentials={devCredentials} />);

    fireEvent.click(screen.getByText(/Mmiliki/));

    expect(screen.getByLabelText(/Email/i)).toHaveValue('owner@shoprex.co.tz');
  });

  it('shows no development box when the backend offers no accounts', () => {
    render(<LoginForm devCredentials={[]} />);

    expect(screen.queryByText(/Development accounts/i)).toBeNull();
    expect(screen.getByLabelText(/Email/i)).toHaveValue('');
  });

  it('follows the redirect the backend chose for the account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirectTo: '/admin', user: { console: 'admin' } }),
      }),
    );

    render(<LoginForm devCredentials={devCredentials} />);
    fireEvent.submit(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
  });

  it('surfaces the backend message when sign-in fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'Barua pepe au nenosiri si sahihi' }),
      }),
    );

    render(<LoginForm devCredentials={devCredentials} />);
    fireEvent.submit(screen.getByRole('button', { name: /Sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Barua pepe au nenosiri si sahihi',
    );
    expect(replace).not.toHaveBeenCalled();
  });
});

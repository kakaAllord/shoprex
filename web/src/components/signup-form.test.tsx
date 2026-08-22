// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignupForm } from './signup-form';

const replace = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function fillForm() {
  fireEvent.change(screen.getByLabelText(/Shop name/i), {
    target: { value: 'Duka la Mama Anna' },
  });
  fireEvent.change(screen.getByLabelText(/Email/i), {
    target: { value: 'mama.anna@shoprex.co.tz' },
  });
  fireEvent.change(screen.getByLabelText(/Phone/i), { target: { value: '0712345678' } });
  fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'shoprex12345' } });
}

afterEach(() => {
  vi.restoreAllMocks();
  replace.mockClear();
  refresh.mockClear();
});

describe('SignupForm', () => {
  it('opens empty — nothing is prefilled for a real shopkeeper', () => {
    render(<SignupForm />);

    expect(screen.getByLabelText(/Shop name/i)).toHaveValue('');
    expect(screen.getByLabelText(/Email/i)).toHaveValue('');
  });

  it('sends what the shopkeeper typed and follows the backend redirect', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirectTo: '/owner', user: { console: 'owner' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SignupForm />);
    fillForm();
    fireEvent.submit(screen.getByRole('button', { name: /Create shop/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/owner'));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      shopName: 'Duka la Mama Anna',
      email: 'mama.anna@shoprex.co.tz',
      phone: '0712345678',
      password: 'shoprex12345',
    });
  });

  it('shows the backend message when the phone number is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          message: ['Namba ya simu si sahihi · Enter a Tanzanian mobile number'],
        }),
      }),
    );

    render(<SignupForm />);
    fillForm();
    fireEvent.submit(screen.getByRole('button', { name: /Create shop/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Namba ya simu si sahihi');
    expect(replace).not.toHaveBeenCalled();
  });

  it('reports an unreachable backend instead of failing silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    render(<SignupForm />);
    fillForm();
    fireEvent.submit(screen.getByRole('button', { name: /Create shop/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend unreachable');
  });
});

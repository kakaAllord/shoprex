// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConsoleNav } from './console-nav';
import type { AuthProfile } from '../lib/api/auth';

const profile = (role: AuthProfile['role']): AuthProfile => ({
  id: 'u1',
  email: 'someone@duka.co.tz',
  phone: null,
  fullName: 'Mtu',
  role,
  businessId: 'b1',
  businessName: 'Duka la Mfano',
  console: 'owner',
});

describe('ConsoleNav', () => {
  it('gives the owner every destination the console has', () => {
    render(<ConsoleNav profile={profile('OWNER')} current="/owner" />);

    for (const label of [/Muhtasari/, /Mauzo/, /Stoo/, /Bidhaa/, /Matawi/, /Wafanyakazi/, /Simu/, /Malipo/]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('shows a manager fewer doors rather than the same doors greyed out', () => {
    // A dimmed control teaches somebody that Shoprex is broken; an absent one,
    // paired with the written note on each owner-only page, teaches them who
    // to ask. The backend refuses the action either way.
    render(<ConsoleNav profile={profile('MANAGER')} current="/owner" />);

    expect(screen.queryByRole('link', { name: /Matawi/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Malipo/ })).toBeNull();

    expect(screen.getByRole('link', { name: /Mauzo/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stoo/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wafanyakazi/ })).toBeInTheDocument();
  });

  it('marks where the reader currently is', () => {
    render(<ConsoleNav profile={profile('OWNER')} current="/owner/sales" />);

    expect(screen.getByRole('link', { name: /Mauzo/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /Muhtasari/ })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState, ErrorState, OwnerOnlyNote } from './states';
import { ShoprexApiError } from '../lib/api/client';

describe('EmptyState', () => {
  it('says what is empty and what to do about it', () => {
    render(<EmptyState title="Stoo ni tupu · Nothing on the shelf" hint="Pokea mzigo." />);

    expect(screen.getByText(/Stoo ni tupu/)).toBeInTheDocument();
    expect(screen.getByText('Pokea mzigo.')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('offers a retry for a failure that might not repeat', () => {
    render(<ErrorState error={new Error('boom')} retryHref="/owner/stock" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Jaribu tena/ })).toHaveAttribute(
      'href',
      '/owner/stock',
    );
  });

  it('does not call an unreachable backend the user’s fault', () => {
    render(<ErrorState error={new TypeError('fetch failed')} />);

    expect(screen.getByText(/Seva haipatikani/)).toBeInTheDocument();
  });

  it('renders a 403 as the shop’s own rule, with no retry', () => {
    // Retrying a permission refusal keeps answering the same way, and framing
    // it as an error teaches somebody that Shoprex is broken when it is not.
    render(
      <ErrorState
        error={new ShoprexApiError(403, 'Huna ruhusa ya kufanya hili (needs VIEW_REPORTS)')}
        retryHref="/owner/sales"
      />,
    );

    expect(screen.getByText(/You do not have permission/)).toBeInTheDocument();
    expect(screen.getByText(/needs VIEW_REPORTS/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Jaribu tena/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('passes the backend’s own words through rather than inventing a second vocabulary', () => {
    render(<ErrorState error={new ShoprexApiError(409, 'That device is already revoked')} />);

    expect(screen.getByText('That device is already revoked')).toBeInTheDocument();
  });
});

describe('OwnerOnlyNote', () => {
  it('names who can do it instead of showing a dead button', () => {
    render(<OwnerOnlyNote what="Kuongeza tawi · Adding a branch" />);

    expect(screen.getByText(/Only the shop owner can do this/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

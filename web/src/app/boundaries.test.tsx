// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConsoleError from './error';
import NotFound from './not-found';

/**
 * Phase 8 — the two pages nobody navigates to on purpose.
 *
 * Neither existed before this phase, which meant an unhandled exception showed
 * Next's own English developer screen and a mistyped address showed its
 * unstyled "404 — This page could not be found". In a Swahili-first console
 * both read as the application having broken rather than as a wrong turn.
 *
 * These are the only two screens in the product a shopkeeper reaches while
 * already annoyed, so what they say matters more than usual — and they are
 * also the two nobody will ever remember to look at again by hand.
 */
describe('the error boundary', () => {
  it('says what happened without asking anybody to read a stack trace', () => {
    render(<ConsoleError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Kuna hitilafu/)).toBeInTheDocument();
  });

  it('reassures the reader that nothing they saved has been lost', () => {
    // The first thing somebody thinks when a screen breaks mid-shift, and the
    // cheapest thing in the world to answer.
    render(<ConsoleError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByText(/Hakuna taarifa iliyopotea/)).toBeInTheDocument();
  });

  it('re-runs the failed render when Jaribu tena is pressed', () => {
    const reset = vi.fn();

    render(<ConsoleError error={new Error('boom')} reset={reset} />);
    screen.getByRole('button', { name: /Jaribu tena/ }).click();

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows the digest when there is one, because it is the only handle in production', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<ConsoleError error={error} reset={vi.fn()} />);

    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('says nothing about a digest when there is none, rather than an empty label', () => {
    render(<ConsoleError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.queryByText(/Namba ya hitilafu/)).not.toBeInTheDocument();
  });

  it('always offers a way out that does not depend on the broken page', () => {
    render(<ConsoleError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByRole('link', { name: /Rudi mwanzo/ })).toHaveAttribute('href', '/');
  });
});

describe('the not-found page', () => {
  it('says the address is wrong rather than that Shoprex is broken', () => {
    render(<NotFound />);

    expect(screen.getByText(/Ukurasa haupo/)).toBeInTheDocument();
  });

  it('offers no retry, because retrying a wrong address answers the same way', () => {
    render(<NotFound />);

    expect(screen.queryByText(/Jaribu tena/)).not.toBeInTheDocument();
  });

  it('is not dressed as a fault — a wrong turn is not an error', () => {
    const { container } = render(<NotFound />);

    // Plain state, not the red one, and no `role="alert"` shouting about it.
    expect(container.querySelector('.shoprex-state--error')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('points at the signpost, which already knows which console the reader belongs to', () => {
    render(<NotFound />);

    expect(screen.getByRole('link', { name: /Rudi mwanzo/ })).toHaveAttribute('href', '/');
  });
});

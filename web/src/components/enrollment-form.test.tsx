// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActionState } from '../lib/action-state';

/**
 * The enrollment code, and the QR that carries the same code.
 *
 * The backend's half is proven in `backend/src/domain/enrollment-qr.spec.ts`
 * and `backend/test/device-enrollment.e2e-spec.ts` — that the SVG is a
 * faithful, scannable rendering, and that the string it carries redeems. What
 * is proven *here* is the half those cannot see: that the SVG actually reaches
 * the DOM rather than being escaped into visible angle brackets, which is the
 * one way inlining markup usually goes wrong.
 */

const secret: NonNullable<ActionState['secret']> = {
  code: 'EJJ9-HQP9-2JS6',
  qrSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25"><path fill="#ffffff" d="M0 0h25v25H0z"/><path stroke="#0f172a" d="M2 2.5h7"/></svg>',
  deviceName: 'Simu ya kaunta',
  expiresAt: '2026-08-24T12:00:00.000Z',
};

// The form is a client component driven by a server action; the action itself
// is exercised end to end by the backend suite. Here it only has to return the
// state the component renders from.
vi.mock('../app/owner/actions', () => ({
  issueEnrollmentAction: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useActionState: () => [secret ? { error: null, message: null, secret } : null, vi.fn()],
  };
});

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');

  return { ...actual, useFormStatus: () => ({ pending: false }) };
});

const { EnrollmentForm } = await import('./enrollment-form');

const branches = [{ id: 'b1', businessId: 'shop', name: 'Tawi Kuu', isActive: true, createdAt: '' }];

describe('EnrollmentForm, once a code has been issued', () => {
  it('shows the code as text, for somebody reading it down a phone line', () => {
    render(<EnrollmentForm branches={branches} />);

    expect(screen.getByText('EJJ9-HQP9-2JS6')).toBeInTheDocument();
  });

  /**
   * The failure this exists to catch: React escaping the markup, so the owner
   * sees `<svg ...>` as literal text instead of a QR code. It looks fine in a
   * typecheck and is obvious only on screen.
   */
  it('paints the QR as real SVG rather than escaping it into visible text', () => {
    const { container } = render(<EnrollmentForm branches={branches} />);

    const svg = container.querySelector('.shoprex-secret__qr svg');

    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(screen.queryByText(/<svg/)).toBeNull();
  });

  it('labels the QR for a screen reader, which cannot see a picture of a code', () => {
    render(<EnrollmentForm branches={branches} />);

    expect(screen.getByRole('img', { name: /Simu ya kaunta/ })).toBeInTheDocument();
  });

  /**
   * The QR is the credential, so the screen has to say the same "write it down
   * now" thing it says about the code — a QR that vanishes on reload is no
   * more recoverable than the text was.
   */
  it('still says the code is shown only once', () => {
    render(<EnrollmentForm branches={branches} />);

    expect(screen.getByText(/hauonyeshwi tena/)).toBeInTheDocument();
  });

  it('points at the button the phone actually offers', () => {
    render(<EnrollmentForm branches={branches} />);

    expect(screen.getByText(/Soma msimbo/)).toBeInTheDocument();
  });
});

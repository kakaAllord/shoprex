'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { issueEnrollmentAction } from '../app/owner/actions';
import { IDLE } from '../lib/action-state';
import type { BranchView } from '../lib/api/organization';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="shoprex-button" disabled={pending}>
      {pending ? 'Inatengeneza...' : 'Tengeneza msimbo · Issue code'}
    </button>
  );
}

/**
 * Issuing the one-time enrollment code.
 *
 * This form has its own component rather than using `ActionForm` because of
 * what it returns: the code is shown **once**. The backend stores only a
 * SHA-256 hash and no later request can fetch it, so the screen has to say so
 * plainly and the owner has to write it down before navigating away. Nothing
 * here stores it either — it lives in React state until the page changes, and
 * then it is gone in the same way it is gone from the server.
 */
export function EnrollmentForm({ branches }: { branches: BranchView[] }) {
  const [state, formAction] = useActionState(issueEnrollmentAction, IDLE);

  return (
    <>
      {state.secret ? (
        <div className="shoprex-secret" role="status">
          <p className="shoprex-card__title" style={{ margin: 0 }}>
            Msimbo wa &ldquo;{state.secret.deviceName}&rdquo;
          </p>
          <p className="shoprex-secret__code">{state.secret.code}</p>
          <p className="shoprex-note" style={{ marginTop: 4 }}>
            <strong>Andika sasa.</strong> Msimbo huu hauonyeshwi tena kamwe — Shoprex
            huhifadhi alama yake tu, si msimbo wenyewe. Write it down now: this code is
            never shown again, and Shoprex stores only its hash.
          </p>
          <p className="shoprex-note">
            Unaisha · Expires {new Date(state.secret.expiresAt).toLocaleString('en-GB')}. Ukiupoteza,
            tengeneza mwingine.
          </p>
        </div>
      ) : null}

      <form action={formAction}>
        <div className="shoprex-fieldgrid">
          <div className="shoprex-field">
            <label className="shoprex-label" htmlFor="enroll-branch">
              Tawi · Branch this phone belongs to
            </label>
            <select id="enroll-branch" name="branchId" required className="shoprex-input">
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="shoprex-field">
            <label className="shoprex-label" htmlFor="enroll-name">
              Jina la simu · What to call this phone
            </label>
            <input
              id="enroll-name"
              name="deviceName"
              required
              className="shoprex-input"
              placeholder="Simu ya kaunta"
            />
          </div>
        </div>

        <SubmitButton />

        {state.error ? (
          <p className="shoprex-alert" role="alert" style={{ marginTop: 12 }}>
            {state.error}
          </p>
        ) : null}
      </form>
    </>
  );
}

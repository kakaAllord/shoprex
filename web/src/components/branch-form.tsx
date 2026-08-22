'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createBranchAction,
  type BranchFormState,
} from '../app/owner/actions';

const initialState: BranchFormState = { error: null, createdName: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="shoprex-button" disabled={pending}>
      {pending ? 'Inaongeza...' : 'Ongeza tawi · Add branch'}
    </button>
  );
}

/** Owner-only: name a new branch. The backend decides which business it lands in. */
export function BranchForm() {
  const [state, formAction] = useActionState(createBranchAction, initialState);

  return (
    <form action={formAction}>
      <div className="shoprex-inlineform">
        <input
          type="text"
          name="name"
          required
          minLength={2}
          className="shoprex-input"
          placeholder="Jina la tawi · Branch name"
          aria-label="Jina la tawi · Branch name"
        />
        <SubmitButton />
      </div>

      {state.error ? (
        <p className="shoprex-alert" role="alert" style={{ marginTop: 12 }}>
          {state.error}
        </p>
      ) : null}

      {state.createdName ? (
        <p className="shoprex-note" role="status">
          Tawi &ldquo;{state.createdName}&rdquo; limeongezwa · Branch added.
        </p>
      ) : null}
    </form>
  );
}

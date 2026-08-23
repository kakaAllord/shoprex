import { createBranchAction } from '../app/owner/actions';
import { ActionForm } from './action-form';

/**
 * Owner-only: name a new branch. The backend decides which business it lands
 * in, from the session token — a client cannot name the shop it writes into.
 *
 * The form plumbing moved into `ActionForm` when Phase 6 gave the console a
 * dozen more writes; this stays as the branch screen's own component so the
 * page reads as what it is rather than as a generic form with a branch-shaped
 * field list.
 */
export function BranchForm() {
  return (
    <ActionForm action={createBranchAction} label="Ongeza tawi · Add branch" busyLabel="Inaongeza..." inline>
      <input
        type="text"
        name="name"
        required
        minLength={2}
        className="shoprex-input"
        placeholder="Jina la tawi · Branch name"
        aria-label="Jina la tawi · Branch name"
      />
    </ActionForm>
  );
}

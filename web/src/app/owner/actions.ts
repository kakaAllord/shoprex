'use server';

import { revalidatePath } from 'next/cache';
import { ShoprexApiError } from '../../lib/api/client';
import { createBranch } from '../../lib/api/organization';
import { readSessionToken } from '../../lib/api/session';

export interface BranchFormState {
  error: string | null;
  createdName: string | null;
}

/**
 * Creates a branch in the caller own business.
 *
 * The token comes from the session cookie and the backend derives the business
 * from it, so a client cannot name the business it writes into.
 */
export async function createBranchAction(
  _previous: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const name = String(formData.get('name') ?? '').trim();

  if (name.length < 2) {
    return { error: 'Jina la tawi ni fupi mno · Branch name is too short', createdName: null };
  }

  const token = await readSessionToken();

  if (!token) {
    return { error: 'Muda wa kuingia umeisha · Session expired', createdName: null };
  }

  try {
    const branch = await createBranch(token, name);
    revalidatePath('/owner');

    return { error: null, createdName: branch.name };
  } catch (error) {
    if (error instanceof ShoprexApiError) {
      return { error: error.message, createdName: null };
    }

    return { error: 'Seva haipatikani · Backend unreachable', createdName: null };
  }
}

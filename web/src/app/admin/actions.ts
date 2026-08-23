'use server';

import { revalidatePath } from 'next/cache';
import { ShoprexApiError } from '../../lib/api/client';
import { createBusiness, setBusinessActive } from '../../lib/api/organization';
import { readSessionToken } from '../../lib/api/session';
import type { ActionState } from '../../lib/action-state';

/**
 * The platform administrator's two writes.
 *
 * Kept apart from the owner console's actions on purpose: these act across
 * tenants, and mixing them into a file whose every other function is scoped to
 * "the caller's own shop" would make the one dangerous shape look like the
 * safe ones. The backend enforces the role either way.
 */

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

async function run(work: (token: string) => Promise<string>): Promise<ActionState> {
  const token = await readSessionToken();

  if (!token) {
    return { error: 'Muda wa kuingia umeisha · Session expired', message: null, secret: null };
  }

  try {
    const message = await work(token);

    revalidatePath('/admin');

    return { error: null, message, secret: null };
  } catch (error) {
    if (error instanceof ShoprexApiError) {
      return { error: error.message, message: null, secret: null };
    }

    return { error: 'Seva haipatikani · Backend unreachable', message: null, secret: null };
  }
}

export async function createBusinessAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const name = text(form, 'name');
  const ownerFullName = text(form, 'ownerFullName');
  const ownerEmail = text(form, 'ownerEmail');
  const ownerPassword = text(form, 'ownerPassword');

  if (!name || !ownerFullName || !ownerEmail || !ownerPassword) {
    return {
      error: 'Jaza sehemu zote · Every field is required',
      message: null,
      secret: null,
    };
  }

  return run(async (token) => {
    const business = await createBusiness(token, {
      name,
      ownerFullName,
      ownerEmail,
      ownerPassword,
    });

    return `${business.name} imefunguliwa · Shop created, and ${ownerEmail} can sign in now.`;
  });
}

/**
 * Suspending or restoring a shop account.
 *
 * Suspension takes effect immediately in every direction: nobody in the shop
 * can sign in, no phone can enrol, and the session tokens already in
 * circulation are refused on their very next request. **Nothing is deleted**,
 * which is what makes it a safe thing to do — the products, stock, sales, and
 * history are all still there when it is restored.
 */
export async function setBusinessActiveAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const businessId = text(form, 'businessId');
  const isActive = text(form, 'isActive') === 'true';

  return run(async (token) => {
    const business = await setBusinessActive(token, businessId, isActive);

    return isActive
      ? `${business.name} imerudishwa · Restored. Watu wake wanaweza kuingia tena.`
      : `${business.name} imesimamishwa · Suspended. Hakuna anayeweza kuingia, na vipindi vilivyofunguliwa vimekatishwa sasa hivi.`;
  });
}

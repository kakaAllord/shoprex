'use server';

import { revalidatePath } from 'next/cache';
import { ShoprexApiError } from '../../lib/api/client';
import { createBranch } from '../../lib/api/organization';
import {
  createWorker,
  createManager,
  setPermissions,
  type UserPermission,
} from '../../lib/api/staff';
import { issueEnrollment, revokeDevice } from '../../lib/api/devices';
import {
  attachBarcode,
  createProduct,
  updateProduct,
  updateProductUnit,
} from '../../lib/api/products';
import {
  createPaymentMethod,
  updatePaymentMethod,
  type PaymentMethodKind,
} from '../../lib/api/payment-methods';
import { readSessionToken } from '../../lib/api/session';
import type { ActionState } from '../../lib/action-state';

/**
 * Every write the owner console makes.
 *
 * Three rules hold across all of them, and they are why this file is one file:
 *
 *  - **The token comes from the httpOnly session cookie**, never from the
 *    form. A client cannot name whose shop it is writing into.
 *  - **The backend decides.** These actions validate only enough to avoid
 *    sending an obviously empty request; every tenant, branch, role, and
 *    permission check happens on the server, and a `403` here is rendered as
 *    the shop's own rule rather than swallowed.
 *  - **A failure says what did not happen.** Nothing is optimistic, and no
 *    action reports success it did not get.
 */

/**
 * The shape every action below ends in.
 *
 * A `ShoprexApiError` already carries the backend's own message, which is
 * written for the person reading it — passing it through beats inventing a
 * second vocabulary for the same failure.
 */
async function run(
  work: (token: string) => Promise<string>,
  paths: string[],
): Promise<ActionState> {
  const token = await readSessionToken();

  if (!token) {
    return { error: 'Muda wa kuingia umeisha · Session expired', message: null, secret: null };
  }

  try {
    const message = await work(token);

    for (const path of paths) {
      revalidatePath(path);
    }

    return { error: null, message, secret: null };
  } catch (error) {
    if (error instanceof ShoprexApiError) {
      return { error: error.message, message: null, secret: null };
    }

    return { error: 'Seva haipatikani · Backend unreachable', message: null, secret: null };
  }
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

const permissionsFrom = (form: FormData): UserPermission[] =>
  form.getAll('permissions').map((value) => String(value) as UserPermission);

/** A number field that was left empty is absent, not zero. */
const optionalInteger = (form: FormData, key: string): number | undefined => {
  const raw = text(form, key);

  return raw === '' ? undefined : Number(raw);
};

// --- Branches --------------------------------------------------------------

export async function createBranchAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const name = text(form, 'name');

  if (name.length < 2) {
    return { error: 'Jina la tawi ni fupi mno · Branch name is too short', message: null };
  }

  return run(async (token) => {
    const branch = await createBranch(token, name);

    return `Tawi "${branch.name}" limeongezwa · Branch added`;
  }, ['/owner', '/owner/branches']);
}

// --- Staff -----------------------------------------------------------------

export async function createWorkerAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const fullName = text(form, 'fullName');
  const password = text(form, 'password');
  const branchId = text(form, 'branchId');

  if (!fullName || !password || !branchId) {
    return {
      error: 'Jina, nenosiri na tawi vinahitajika · Name, password, and branch are required',
      message: null,
    };
  }

  return run(async (token) => {
    // A worker deliberately has no email: they sign in on a branch phone, not
    // in this console.
    const worker = await createWorker(token, {
      fullName,
      password,
      branchId,
      permissions: permissionsFrom(form),
    });

    return `${worker.fullName} ameongezwa · Worker added. Mpe msimbo wa simu kutoka ukurasa wa Simu.`;
  }, ['/owner', '/owner/staff']);
}

export async function createManagerAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const fullName = text(form, 'fullName');
  const email = text(form, 'email');
  const password = text(form, 'password');
  const branchIds = form.getAll('branchIds').map(String).filter(Boolean);

  if (!fullName || !email || !password) {
    return {
      error: 'Jina, barua pepe na nenosiri vinahitajika · Name, email, and password are required',
      message: null,
    };
  }

  if (branchIds.length === 0) {
    return {
      error: 'Chagua angalau tawi moja · A manager needs at least one branch',
      message: null,
    };
  }

  return run(async (token) => {
    const manager = await createManager(token, {
      fullName,
      email,
      password,
      branchIds,
      permissions: permissionsFrom(form),
    });

    return `${manager.fullName} ameongezwa kama meneja · Manager added`;
  }, ['/owner', '/owner/staff']);
}

export async function setPermissionsAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const userId = text(form, 'userId');

  return run(async (token) => {
    // Replaces the set outright, exactly as the backend does: a box left
    // unticked is a permission taken away, which is why the form posts every
    // box rather than only the changed ones.
    const person = await setPermissions(token, userId, permissionsFrom(form));

    return `Ruhusa za ${person.fullName} zimebadilishwa · Permissions updated`;
  }, ['/owner/staff']);
}

// --- Devices ---------------------------------------------------------------

/**
 * Issues an enrollment code and hands it back **once**.
 *
 * The backend stores only a SHA-256 hash, so no later request can fetch it
 * again. That is why this is the one action that returns something beyond a
 * message, and why the screen tells the owner to write it down.
 */
export async function issueEnrollmentAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const branchId = text(form, 'branchId');
  const deviceName = text(form, 'deviceName');

  if (!branchId || !deviceName) {
    return {
      error: 'Chagua tawi na uipe simu jina · Choose a branch and name the phone',
      message: null,
    };
  }

  const token = await readSessionToken();

  if (!token) {
    return { error: 'Muda wa kuingia umeisha · Session expired', message: null, secret: null };
  }

  try {
    const issued = await issueEnrollment(token, branchId, deviceName);

    revalidatePath('/owner/devices');

    return {
      error: null,
      message: null,
      secret: {
        code: issued.code,
        deviceName: issued.deviceName,
        expiresAt: issued.expiresAt,
      },
    };
  } catch (error) {
    if (error instanceof ShoprexApiError) {
      return { error: error.message, message: null, secret: null };
    }

    return { error: 'Seva haipatikani · Backend unreachable', message: null, secret: null };
  }
}

export async function revokeDeviceAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const deviceId = text(form, 'deviceId');

  return run(async (token) => {
    const device = await revokeDevice(token, deviceId);

    return `Simu "${device.name}" imefutwa · Revoked. Itakataliwa mara moja.`;
  }, ['/owner', '/owner/devices']);
}

// --- Products --------------------------------------------------------------

export async function createProductAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const name = text(form, 'name');
  const unitName = text(form, 'unitName');
  const barcode = text(form, 'barcode');
  const priceTzs = optionalInteger(form, 'priceTzs');

  if (!name || !unitName) {
    return {
      error: 'Jina la bidhaa na kipimo vinahitajika · A name and one unit are required',
      message: null,
    };
  }

  return run(async (token) => {
    // One unit and a name is the minimum Shoprex ever asks for. A price and a
    // barcode can both arrive later, and a second packaging is added from the
    // product's own row.
    const product = await createProduct(token, {
      name,
      units: [{ name: unitName, ...(priceTzs === undefined ? {} : { priceTzs }) }],
      ...(barcode ? { barcode } : {}),
    });

    return `${product.name} imeongezwa · Product added`;
  }, ['/owner/products']);
}

export async function setUnitPriceAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productId = text(form, 'productId');
  const unitId = text(form, 'unitId');
  const priceTzs = optionalInteger(form, 'priceTzs');

  if (priceTzs === undefined || Number.isNaN(priceTzs) || priceTzs < 0) {
    return { error: 'Weka bei kwa shilingi nzima · Enter a whole-shilling price', message: null };
  }

  return run(async (token) => {
    const product = await updateProductUnit(token, productId, unitId, { priceTzs });
    const unit = product.units.find((candidate) => candidate.id === unitId);

    // Worth saying out loud on the screen: repricing never rewrites history.
    return `Bei ya ${product.name} (${unit?.name}) imebadilishwa · Price changed. Risiti za zamani hazibadiliki.`;
  }, ['/owner/products']);
}

export async function setProductActiveAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productId = text(form, 'productId');
  const isActive = text(form, 'isActive') === 'true';

  return run(async (token) => {
    const product = await updateProduct(token, productId, { isActive });

    return isActive
      ? `${product.name} imerudishwa · Back on sale`
      : `${product.name} imesitishwa · Discontinued. Haiwezi kuuzwa wala kupokelewa, lakini historia haijaguswa.`;
  }, ['/owner/products']);
}

export async function attachBarcodeAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productId = text(form, 'productId');
  const barcode = text(form, 'barcode');
  const productUnitId = text(form, 'productUnitId');

  if (!barcode) {
    return { error: 'Weka namba ya bidhaa · Enter a barcode', message: null };
  }

  return run(async (token) => {
    const product = await attachBarcode(
      token,
      productId,
      barcode,
      productUnitId || undefined,
    );

    return `Namba imeunganishwa na ${product.name} · Barcode attached`;
  }, ['/owner/products']);
}

// --- Payment methods -------------------------------------------------------

export async function createPaymentMethodAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const name = text(form, 'name');
  const kind = text(form, 'kind') as PaymentMethodKind;

  if (!name || !kind) {
    return { error: 'Jina na aina vinahitajika · A name and a kind are required', message: null };
  }

  return run(async (token) => {
    const method = await createPaymentMethod(token, { name, kind });

    return `${method.name} imeongezwa · Payment method added`;
  }, ['/owner/payment-methods']);
}

export async function setMethodActiveAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const methodId = text(form, 'methodId');
  const isActive = text(form, 'isActive') === 'true';

  return run(async (token) => {
    const method = await updatePaymentMethod(token, methodId, { isActive });

    return isActive
      ? `${method.name} imewashwa · Switched on`
      : `${method.name} imezimwa · Switched off. Haitatokea tena kwenye simu.`;
  }, ['/owner/payment-methods']);
}

export async function renameMethodAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const methodId = text(form, 'methodId');
  const name = text(form, 'name');

  if (!name) {
    return { error: 'Weka jina · Enter a name', message: null };
  }

  return run(async (token) => {
    const method = await updatePaymentMethod(token, methodId, { name });

    return `Jina limebadilishwa kuwa ${method.name} · Renamed. Risiti za zamani hazibadiliki.`;
  }, ['/owner/payment-methods']);
}

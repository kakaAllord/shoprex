/**
 * What the payment sheet needs to know before the seller taps *Maliza*.
 *
 * The backend is the authority on settlement — it recomputes every one of
 * these numbers and refuses the sale if they do not add up. This module exists
 * so the seller can *see* the change before handing it over, and so the
 * confirm button can be disabled with a reason instead of failing after a
 * round trip on a slow connection.
 *
 * The formulas are deliberately the same as `backend/src/domain/sale.ts`:
 * `sum(amounts) = total`, and `change = cash_received − amount`. Two
 * implementations that agree is the point; the phone never decides anything
 * the backend does not re-decide.
 */

export type PaymentKind = 'CASH' | 'MOBILE_MONEY' | 'BANK' | 'DEBT' | 'OTHER';

export interface PaymentMethod {
  id: string;
  name: string;
  kind: PaymentKind;
}

/** One row on the payment sheet, as the seller has filled it in so far. */
export interface PaymentEntry {
  method: PaymentMethod;
  amountTzs: number;
  /** Cash only: what the customer handed over. */
  cashReceivedTzs?: number | null;
  /** Debt only: who owes it. */
  debtorName?: string | null;
}

export interface PaymentState {
  totalTzs: number;
  settledTzs: number;
  /** What is still unpaid. Negative means the seller has entered too much. */
  remainingTzs: number;
  /** Cash to hand back, across the whole sale. */
  changeTzs: number;
  ready: boolean;
  /** Why it is not ready yet, in the seller's own language. Null when it is. */
  blockedBecause: string | null;
}

export function changeFor(entry: PaymentEntry): number | null {
  if (entry.method.kind !== 'CASH') {
    return null;
  }

  const received = entry.cashReceivedTzs ?? null;

  if (received === null || received < entry.amountTzs) {
    return null;
  }

  return received - entry.amountTzs;
}

/**
 * The state of the sheet: what is left to settle, what to hand back, and
 * whether the sale can be completed yet.
 */
export function paymentState(totalTzs: number, entries: readonly PaymentEntry[]): PaymentState {
  const settledTzs = entries.reduce((sum, entry) => sum + entry.amountTzs, 0);
  const remainingTzs = totalTzs - settledTzs;
  const changeTzs = entries.reduce((sum, entry) => sum + (changeFor(entry) ?? 0), 0);

  const base = { totalTzs, settledTzs, remainingTzs, changeTzs };

  if (entries.length === 0) {
    return { ...base, ready: false, blockedBecause: 'Chagua namna ya kulipa · Choose how they are paying' };
  }

  if (entries.some((entry) => !Number.isInteger(entry.amountTzs) || entry.amountTzs < 1)) {
    return { ...base, ready: false, blockedBecause: 'Kila malipo yanahitaji kiasi · Every payment needs an amount' };
  }

  const debts = entries.filter((entry) => entry.method.kind === 'DEBT');

  if (debts.length > 1) {
    return { ...base, ready: false, blockedBecause: 'Deni moja tu kwa mauzo · Only one debt per sale' };
  }

  if (debts.some((entry) => !entry.debtorName?.trim())) {
    return { ...base, ready: false, blockedBecause: 'Andika jina la mdaiwa · Write the debtor’s name' };
  }

  const shortCash = entries.some(
    (entry) =>
      entry.method.kind === 'CASH' &&
      entry.cashReceivedTzs !== null &&
      entry.cashReceivedTzs !== undefined &&
      entry.cashReceivedTzs < entry.amountTzs,
  );

  if (shortCash) {
    return { ...base, ready: false, blockedBecause: 'Pesa iliyotolewa haitoshi · The cash given is less than the amount' };
  }

  if (remainingTzs > 0) {
    return { ...base, ready: false, blockedBecause: 'Bado kuna kiasi kilichobaki · Part of the bill is still unpaid' };
  }

  if (remainingTzs < 0) {
    return { ...base, ready: false, blockedBecause: 'Malipo yamezidi jumla · The payments add up to more than the total' };
  }

  return { ...base, ready: true, blockedBecause: null };
}

/** The payments in the shape `POST /branches/{id}/sales` expects. */
export function toSalePayments(entries: readonly PaymentEntry[]) {
  return entries.map((entry) => ({
    paymentMethodId: entry.method.id,
    amountTzs: entry.amountTzs,
    // Only ever sent for the kind that may carry it — the backend refuses the
    // rest, and sending them anyway would be asking to be told off.
    ...(entry.method.kind === 'CASH' && entry.cashReceivedTzs
      ? { cashReceivedTzs: entry.cashReceivedTzs }
      : {}),
    ...(entry.method.kind === 'DEBT' && entry.debtorName?.trim()
      ? { debtorName: entry.debtorName.trim() }
      : {}),
  }));
}

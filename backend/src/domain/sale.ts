/**
 * Sale arithmetic and payment settlement.
 *
 * A sale is deterministic: every line total is `quantity × unit_price`, the
 * sale total is their sum, and a sale is only complete when the payments add
 * up to it exactly. Doc 02 §§6–7.
 *
 * Two rules here are worth stating plainly, because they are what stop a
 * disagreement from being written down as a fact:
 *
 * - **Money is whole shillings, always.** Every amount that crosses this
 *   module is checked to be a whole number. There is no rounding step, because
 *   there is nothing to round: a fractional shilling entering the arithmetic
 *   is a bug upstream, and it is refused here rather than absorbed.
 * - **Settlement is exact.** `sum(payment_amounts)` must equal the sale total.
 *   Not "close enough", and not "the difference becomes change" — change is
 *   what a *cash* customer overpaid, which is a separate number that never
 *   touches the total.
 *
 * Every function is pure. Nothing here knows about the database, HTTP, or
 * Nest, and it stays that way — see PROGRESS.md §3's handoff notes.
 */

export class SaleMathError extends Error {}

/** The kinds of settlement Shoprex understands, whatever a shop names them. */
export type PaymentKind = 'CASH' | 'MOBILE_MONEY' | 'BANK' | 'DEBT' | 'OTHER';

export interface SaleLineInput {
  /** In the commercial unit actually being sold — 2 Cartons is 2, not 12. */
  quantity: number;
  unitPriceTzs: number;
}

export interface PaymentInput {
  kind: PaymentKind;
  /** How much of the bill this payment settles. */
  amountTzs: number;
  /** Cash only: what the customer physically handed over. */
  cashReceivedTzs?: number | null;
  /** Debt only: who owes it. A free-text name, never a customer account. */
  debtorName?: string | null;
}

export interface SettledPayment {
  kind: PaymentKind;
  amountTzs: number;
  cashReceivedTzs: number | null;
  /** What to hand back. Null when no cash was tendered. */
  changeTzs: number | null;
  debtorName: string | null;
}

export interface Settlement {
  totalTzs: number;
  payments: SettledPayment[];
  /** Cash to hand back across the whole sale. Zero when nothing was tendered. */
  changeTzs: number;
  /** What is walking out unpaid, recorded against a name. Zero when none. */
  debtTzs: number;
}

function assertWholeAmount(value: number, what: string): void {
  if (!Number.isInteger(value)) {
    throw new SaleMathError(`${what} must be a whole number of shillings`);
  }
}

/**
 * `line_total = quantity × unit_price`, and nothing else. Doc 02 §6.
 */
export function lineTotal(quantity: number, unitPriceTzs: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new SaleMathError('A sale line needs a whole quantity of at least 1');
  }

  assertWholeAmount(unitPriceTzs, 'A unit price');

  if (unitPriceTzs < 0) {
    throw new SaleMathError('A unit price cannot be negative');
  }

  return quantity * unitPriceTzs;
}

export function saleTotal(lines: readonly SaleLineInput[]): number {
  if (lines.length === 0) {
    throw new SaleMathError('A sale needs at least one line');
  }

  return lines.reduce((total, line) => total + lineTotal(line.quantity, line.unitPriceTzs), 0);
}

/**
 * Checks the payments against the bill and works out the change.
 *
 * Mixed payments are valid only when they settle the total exactly — half in
 * cash and half on M-Pesa is a normal Tanzanian sale, but half in cash and
 * nothing else is an unfinished one. Doc 02 §7.
 */
export function settle(totalTzs: number, payments: readonly PaymentInput[]): Settlement {
  assertWholeAmount(totalTzs, 'A sale total');

  if (payments.length === 0) {
    throw new SaleMathError('Chagua namna ya kulipa · A sale needs at least one payment');
  }

  if (payments.filter((payment) => payment.kind === 'DEBT').length > 1) {
    // A sale is owed by one person. Two debtor names on one bill is a
    // question about who actually owes it, not something to guess at.
    throw new SaleMathError('A sale can record only one debt');
  }

  const settled = payments.map((payment) => settleOne(payment));
  const paid = settled.reduce((sum, payment) => sum + payment.amountTzs, 0);

  if (paid !== totalTzs) {
    throw new SaleMathError(
      `Malipo hayalingani na jumla · Payments must add up to the sale total: ${paid} settled against ${totalTzs}`,
    );
  }

  return {
    totalTzs,
    payments: settled,
    changeTzs: settled.reduce((sum, payment) => sum + (payment.changeTzs ?? 0), 0),
    debtTzs: settled
      .filter((payment) => payment.kind === 'DEBT')
      .reduce((sum, payment) => sum + payment.amountTzs, 0),
  };
}

function settleOne(payment: PaymentInput): SettledPayment {
  assertWholeAmount(payment.amountTzs, 'A payment amount');

  if (payment.amountTzs < 1) {
    throw new SaleMathError('A payment must be at least 1 shilling');
  }

  const debtorName = payment.debtorName?.trim() || null;

  if (payment.kind === 'DEBT') {
    if (!debtorName) {
      // The only thing a debt sale records. Without it there is nobody to ask.
      throw new SaleMathError('Andika jina la mdaiwa · A debt sale needs a debtor name');
    }
  } else if (debtorName) {
    throw new SaleMathError('Only a debt payment carries a debtor name');
  }

  const cashReceivedTzs = payment.cashReceivedTzs ?? null;

  if (payment.kind !== 'CASH') {
    if (cashReceivedTzs !== null) {
      throw new SaleMathError('Only a cash payment carries an amount received');
    }

    return {
      kind: payment.kind,
      amountTzs: payment.amountTzs,
      cashReceivedTzs: null,
      changeTzs: null,
      debtorName,
    };
  }

  if (cashReceivedTzs === null) {
    // The seller did not say what was handed over — exact money, so nothing
    // to give back. This is the common case for a small sale.
    return {
      kind: 'CASH',
      amountTzs: payment.amountTzs,
      cashReceivedTzs: null,
      changeTzs: null,
      debtorName: null,
    };
  }

  assertWholeAmount(cashReceivedTzs, 'Cash received');

  if (cashReceivedTzs < payment.amountTzs) {
    throw new SaleMathError(
      `Pesa iliyotolewa haitoshi · Cash received (${cashReceivedTzs}) is less than the ${payment.amountTzs} it settles`,
    );
  }

  return {
    kind: 'CASH',
    amountTzs: payment.amountTzs,
    cashReceivedTzs,
    // change = cash_received - amount settled in cash. Doc 02 §7.
    changeTzs: cashReceivedTzs - payment.amountTzs,
    debtorName: null,
  };
}

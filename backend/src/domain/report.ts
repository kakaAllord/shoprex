/**
 * Daily report arithmetic.
 *
 * One day's sales, payments, and deliveries, turned into the handful of
 * numbers an owner actually asks for: what the shop took, how it was paid,
 * what walked out unpaid and against whose name, who sold it, and what arrived
 * on the shelf. Doc 02 §8.
 *
 * Three rules hold this module together, and each one is a mistake it exists
 * to stop:
 *
 * - **It reads snapshots, never live records.** Every input here is a value
 *   the sale itself stored at the moment it happened — `methodName`,
 *   `productName`, `unitPriceTzs`. Joining back to the live `PaymentMethod` or
 *   `ProductUnit` row would report last month using this month's names and
 *   prices, which is the specific way a report starts lying quietly.
 * - **Nothing here decides what "today" is.** The caller hands over the sales
 *   that fall inside a resolved `DayWindow`; the day boundary is `day-window.ts`'s
 *   single job, and doing it twice is how a dashboard and a PDF come to
 *   disagree.
 * - **Money is whole shillings and only ever added.** There is no rate, no
 *   margin, and no profit: V1 does no profit or expense accounting (doc 01 §8),
 *   so nothing here multiplies or divides money at all.
 *
 * Every function is pure — no database, no HTTP, no Nest — beside `units.ts`,
 * `stock.ts`, `sale.ts`, and `day-window.ts`.
 */

import type { PaymentKind } from './sale';

export class ReportMathError extends Error {}

// ---------------------------------------------------------------------------
// What goes in. Deliberately plain shapes rather than Prisma rows, so the
// arithmetic can be tested without a database and cannot quietly start
// reading a field the snapshot rule forbids.
// ---------------------------------------------------------------------------

export interface ReportSaleLine {
  productId: string;
  /** Snapshotted on the line. Not the product's name today. */
  productName: string;
  unitName: string;
  quantity: number;
  lineTotalTzs: number;
  /** How much of this line the branch's records could not cover, in base units. */
  shortfallNormalized: number;
}

export interface ReportSalePayment {
  paymentMethodId: string;
  /** Snapshotted on the payment. Not the method's name today. */
  methodName: string;
  methodKind: PaymentKind;
  amountTzs: number;
  debtorName: string | null;
}

export interface ReportSale {
  id: string;
  soldById: string;
  soldByName: string;
  totalTzs: number;
  changeTzs: number;
  debtTzs: number;
  createdAt: Date;
  lines: ReportSaleLine[];
  payments: ReportSalePayment[];
}

export interface ReportReceiptLine {
  productId: string;
  productName: string;
  productUnitId: string;
  unitName: string;
  quantity: number;
  /** What one of that unit cost. Null when the shop recorded no cost. */
  unitCostTzs: number | null;
}

export interface ReportReceipt {
  id: string;
  receivedById: string;
  receivedByName: string;
  createdAt: Date;
  lines: ReportReceiptLine[];
}

// ---------------------------------------------------------------------------
// What comes out.
// ---------------------------------------------------------------------------

export interface DailyTotals {
  /** How many sales were completed. */
  saleCount: number;
  /** The sum of every bill. What the shop sold, paid or not. */
  salesTotalTzs: number;
  /** What walked out unpaid, against a name. Part of `salesTotalTzs`. */
  debtTzs: number;
  /**
   * `salesTotalTzs − debtTzs`. What actually settled — the number an owner
   * means by "how much did we take today".
   */
  collectedTzs: number;
  /** Cash handed back across the day. Never part of a total. */
  changeTzs: number;
  /** How many commercial units went over the counter, as lines. */
  lineCount: number;
  /** How many sales sold more than the branch's records held. */
  salesWithShortfall: number;
}

export interface PaymentBreakdownRow {
  paymentMethodId: string;
  methodName: string;
  methodKind: PaymentKind;
  /** How many sales this method took part in settling. */
  saleCount: number;
  amountTzs: number;
}

export interface DebtRow {
  debtorName: string;
  amountTzs: number;
  saleCount: number;
}

export interface SellerRow {
  userId: string;
  name: string;
  saleCount: number;
  salesTotalTzs: number;
  debtTzs: number;
}

export interface ReceivedRow {
  productId: string;
  productName: string;
  productUnitId: string;
  unitName: string;
  /** In the commercial unit it arrived in. Six Cartons are 6, not 36. */
  quantity: number;
  /**
   * The cost of the lines that recorded one. Null when none did — a shop may
   * record what arrived without recording what it paid, and a zero there would
   * read as "free".
   */
  costTzs: number | null;
  /** True when some lines carried a cost and others did not. */
  costIsPartial: boolean;
}

export interface ReceivedSummary {
  receiptCount: number;
  lineCount: number;
  rows: ReceivedRow[];
  /** The known costs, summed. Null when nothing recorded one. */
  totalCostTzs: number | null;
  costIsPartial: boolean;
}

export interface TopProductRow {
  productId: string;
  productName: string;
  unitName: string;
  quantity: number;
  totalTzs: number;
}

export interface DailyReportFigures {
  totals: DailyTotals;
  paymentBreakdown: PaymentBreakdownRow[];
  debts: DebtRow[];
  sellers: SellerRow[];
  received: ReceivedSummary;
  topProducts: TopProductRow[];
}

function assertWholeAmount(value: number, what: string): void {
  if (!Number.isInteger(value)) {
    throw new ReportMathError(`${what} must be a whole number of shillings`);
  }
}

/**
 * The headline numbers.
 *
 * `collectedTzs` is the subtraction the owner would otherwise do in their head
 * and get wrong on a busy day: the bills add up to `salesTotalTzs`, but the
 * debts inside them have not been paid, so what is actually in the till and on
 * the phone is the difference.
 *
 * Change is reported but never subtracted from anything. A customer who hands
 * over 10,000 for a 7,000 bill has paid 7,000; the 3,000 that went back was
 * never the shop's.
 */
export function totalsOf(sales: ReportSale[]): DailyTotals {
  let salesTotalTzs = 0;
  let debtTzs = 0;
  let changeTzs = 0;
  let lineCount = 0;
  let salesWithShortfall = 0;

  for (const sale of sales) {
    assertWholeAmount(sale.totalTzs, 'A sale total');
    assertWholeAmount(sale.debtTzs, 'A debt');
    assertWholeAmount(sale.changeTzs, 'Change');

    salesTotalTzs += sale.totalTzs;
    debtTzs += sale.debtTzs;
    changeTzs += sale.changeTzs;
    lineCount += sale.lines.length;

    if (sale.lines.some((line) => line.shortfallNormalized > 0)) {
      salesWithShortfall += 1;
    }
  }

  return {
    saleCount: sales.length,
    salesTotalTzs,
    debtTzs,
    collectedTzs: salesTotalTzs - debtTzs,
    changeTzs,
    lineCount,
    salesWithShortfall,
  };
}

/**
 * How the day was paid for, by method.
 *
 * Grouped by the method's **id** but labelled with the **snapshotted name**, so
 * renaming Taslimu to Cash tomorrow does not split today's takings into two
 * rows, and reading a report from last month still shows the name that was on
 * the button at the time. Where a method really was renamed mid-period, the
 * most recent snapshot wins the label — the amounts are what matter and they
 * stay whole.
 *
 * The rows sum to `totals.salesTotalTzs` exactly, because a sale is only
 * complete when its payments settle the bill exactly (doc 02 §7).
 */
export function paymentBreakdownOf(sales: ReportSale[]): PaymentBreakdownRow[] {
  const rows = new Map<string, PaymentBreakdownRow & { latest: number }>();

  for (const sale of sales) {
    for (const payment of sale.payments) {
      assertWholeAmount(payment.amountTzs, 'A payment amount');

      const existing = rows.get(payment.paymentMethodId);

      if (!existing) {
        rows.set(payment.paymentMethodId, {
          paymentMethodId: payment.paymentMethodId,
          methodName: payment.methodName,
          methodKind: payment.methodKind,
          saleCount: 1,
          amountTzs: payment.amountTzs,
          latest: sale.createdAt.getTime(),
        });

        continue;
      }

      existing.saleCount += 1;
      existing.amountTzs += payment.amountTzs;

      if (sale.createdAt.getTime() >= existing.latest) {
        existing.latest = sale.createdAt.getTime();
        existing.methodName = payment.methodName;
      }
    }
  }

  return [...rows.values()]
    .map(({ latest: _latest, ...row }) => row)
    .sort((a, b) => b.amountTzs - a.amountTzs || a.methodName.localeCompare(b.methodName));
}

/**
 * Who owes what.
 *
 * Grouped by the name that was written down, because that is all V1 records —
 * there is no customer account to group by, deliberately (doc 01 §8). Names
 * are trimmed and matched case-insensitively so "Mama Neema" and "mama neema"
 * are one debtor, but the spelling that is shown is the one first written that
 * day rather than a normalised form nobody typed.
 */
export function debtsOf(sales: ReportSale[]): DebtRow[] {
  const rows = new Map<string, DebtRow>();

  for (const sale of sales) {
    for (const payment of sale.payments) {
      if (payment.methodKind !== 'DEBT') {
        continue;
      }

      const name = (payment.debtorName ?? '').trim();

      if (name === '') {
        // A debt with no name cannot happen — `settle()` refuses one — but a
        // report that crashed on old data would be worse than one that says
        // the name is missing.
        throw new ReportMathError('A debt was recorded without a debtor name');
      }

      const key = name.toLocaleLowerCase();
      const existing = rows.get(key);

      if (!existing) {
        rows.set(key, { debtorName: name, amountTzs: payment.amountTzs, saleCount: 1 });

        continue;
      }

      existing.amountTzs += payment.amountTzs;
      existing.saleCount += 1;
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.amountTzs - a.amountTzs || a.debtorName.localeCompare(b.debtorName),
  );
}

/**
 * What each person sold.
 *
 * Attribution comes from the sale's `soldById` — the session — and never from
 * the handset, which since 2026-08-23 belongs to a branch rather than to a
 * person (PROGRESS.md §2a).
 */
export function sellersOf(sales: ReportSale[]): SellerRow[] {
  const rows = new Map<string, SellerRow>();

  for (const sale of sales) {
    const existing = rows.get(sale.soldById);

    if (!existing) {
      rows.set(sale.soldById, {
        userId: sale.soldById,
        name: sale.soldByName,
        saleCount: 1,
        salesTotalTzs: sale.totalTzs,
        debtTzs: sale.debtTzs,
      });

      continue;
    }

    existing.saleCount += 1;
    existing.salesTotalTzs += sale.totalTzs;
    existing.debtTzs += sale.debtTzs;
  }

  return [...rows.values()].sort(
    (a, b) => b.salesTotalTzs - a.salesTotalTzs || a.name.localeCompare(b.name),
  );
}

/**
 * What arrived, in the packaging it arrived in.
 *
 * Grouped by product *and* unit rather than rolled up: six Cartons and five
 * Pieces of the same product are two things a shopkeeper put on two different
 * shelves, and the engine never repackages upward anyway (doc 02 §5).
 *
 * Cost is reported only where it was recorded. V1 does no profit accounting,
 * so this is "what we paid for what came in" and nothing is derived from it.
 */
export function receivedOf(receipts: ReportReceipt[]): ReceivedSummary {
  const rows = new Map<string, ReceivedRow & { linesWithCost: number; lines: number }>();
  let lineCount = 0;

  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      lineCount += 1;

      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        throw new ReportMathError('A received quantity must be a whole number of at least 1');
      }

      if (line.unitCostTzs !== null) {
        assertWholeAmount(line.unitCostTzs, 'A unit cost');
      }

      const key = `${line.productId}:${line.productUnitId}`;
      const lineCost = line.unitCostTzs === null ? null : line.unitCostTzs * line.quantity;

      const existing = rows.get(key);

      if (!existing) {
        rows.set(key, {
          productId: line.productId,
          productName: line.productName,
          productUnitId: line.productUnitId,
          unitName: line.unitName,
          quantity: line.quantity,
          costTzs: lineCost,
          costIsPartial: false,
          linesWithCost: lineCost === null ? 0 : 1,
          lines: 1,
        });

        continue;
      }

      existing.quantity += line.quantity;
      existing.lines += 1;

      if (lineCost !== null) {
        existing.costTzs = (existing.costTzs ?? 0) + lineCost;
        existing.linesWithCost += 1;
      }
    }
  }

  const finished = [...rows.values()].map((row) => ({
    productId: row.productId,
    productName: row.productName,
    productUnitId: row.productUnitId,
    unitName: row.unitName,
    quantity: row.quantity,
    costTzs: row.costTzs,
    costIsPartial: row.linesWithCost > 0 && row.linesWithCost < row.lines,
  }));

  const withCost = finished.filter((row) => row.costTzs !== null);

  return {
    receiptCount: receipts.length,
    lineCount,
    rows: finished.sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) || a.unitName.localeCompare(b.unitName),
    ),
    totalCostTzs:
      withCost.length === 0 ? null : withCost.reduce((sum, row) => sum + (row.costTzs ?? 0), 0),
    costIsPartial:
      withCost.length > 0 &&
      (withCost.length < finished.length || finished.some((row) => row.costIsPartial)),
  };
}

/**
 * What sold most, by money taken.
 *
 * By value rather than by count, because twenty Pieces and one Carton are not
 * comparable quantities — the engine deliberately never adds them together —
 * while the shillings they brought in are.
 */
export function topProductsOf(sales: ReportSale[], limit: number): TopProductRow[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ReportMathError('A top-products limit must be a whole number of at least 1');
  }

  const rows = new Map<string, TopProductRow>();

  for (const sale of sales) {
    for (const line of sale.lines) {
      const key = `${line.productId}:${line.unitName}`;
      const existing = rows.get(key);

      if (!existing) {
        rows.set(key, {
          productId: line.productId,
          productName: line.productName,
          unitName: line.unitName,
          quantity: line.quantity,
          totalTzs: line.lineTotalTzs,
        });

        continue;
      }

      existing.quantity += line.quantity;
      existing.totalTzs += line.lineTotalTzs;
    }
  }

  return [...rows.values()]
    .sort((a, b) => b.totalTzs - a.totalTzs || a.productName.localeCompare(b.productName))
    .slice(0, limit);
}

/** Every figure on the report, from one day's sales and deliveries. */
export function figuresOf(
  sales: ReportSale[],
  receipts: ReportReceipt[],
  options: { topProducts: number } = { topProducts: 5 },
): DailyReportFigures {
  return {
    totals: totalsOf(sales),
    paymentBreakdown: paymentBreakdownOf(sales),
    debts: debtsOf(sales),
    sellers: sellersOf(sales),
    received: receivedOf(receipts),
    topProducts: topProductsOf(sales, options.topProducts),
  };
}

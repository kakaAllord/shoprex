import { apiRequest } from './client';
import { authorized, queryString } from './request';

export interface ReportWindow {
  date: string;
  timezone: string;
  startUtc: string;
  endUtc: string;
}

export interface DailyTotals {
  saleCount: number;
  salesTotalTzs: number;
  debtTzs: number;
  collectedTzs: number;
  changeTzs: number;
  lineCount: number;
  salesWithShortfall: number;
}

export interface PaymentBreakdownRow {
  paymentMethodId: string;
  methodName: string;
  methodKind: string;
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
  quantity: number;
  costTzs: number | null;
  costIsPartial: boolean;
}

export interface ReceivedSummary {
  receiptCount: number;
  lineCount: number;
  rows: ReceivedRow[];
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

export interface ReportTransaction {
  id: string;
  soldById: string;
  soldByName: string;
  totalTzs: number;
  debtTzs: number;
  lineCount: number;
  paymentMethods: string[];
  hasStockInconsistency: boolean;
  createdAt: string;
}

export interface DailyReport {
  business: { id: string; name: string };
  branch: { id: string; name: string };
  window: ReportWindow;
  totals: DailyTotals;
  paymentBreakdown: PaymentBreakdownRow[];
  debts: DebtRow[];
  sellers: SellerRow[];
  received: ReceivedSummary;
  topProducts: TopProductRow[];
  transactions: ReportTransaction[];
  transactionsTruncated: boolean;
  generatedAt: string;
}

export interface BranchComparisonRow {
  branchId: string;
  branchName: string;
  saleCount: number;
  salesTotalTzs: number;
  debtTzs: number;
  collectedTzs: number;
}

export interface BranchComparison {
  business: { id: string; name: string };
  window: ReportWindow;
  branches: BranchComparisonRow[];
  totals: {
    saleCount: number;
    salesTotalTzs: number;
    debtTzs: number;
    collectedTzs: number;
  };
  generatedAt: string;
}

/**
 * The day, read back. Needs `VIEW_REPORTS`; the owner always has it.
 *
 * `date` is a shop-local calendar day — omit it for today, decided by the
 * **backend** clock in the shop's own zone. The returned `window` names the
 * exact UTC instants counted, so a reader never has to take "today" on trust.
 */
export function fetchDailyReport(
  token: string,
  branchId: string,
  date?: string,
): Promise<DailyReport> {
  return apiRequest<DailyReport>(
    `/branches/${branchId}/reports/daily${queryString({ date })}`,
    authorized(token),
  );
}

/** One day across every branch the caller may see — an owner sees all of their own. */
export function fetchBranchComparison(
  token: string,
  date?: string,
): Promise<BranchComparison> {
  return apiRequest<BranchComparison>(`/reports/branches${queryString({ date })}`, authorized(token));
}

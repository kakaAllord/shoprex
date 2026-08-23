import { apiRequest } from './client';
import { authorized, queryString } from './request';

export interface SaleSummary {
  id: string;
  branchId: string;
  soldById: string;
  soldByName: string;
  totalTzs: number;
  changeTzs: number;
  debtTzs: number;
  lineCount: number;
  paymentMethods: string[];
  hasStockInconsistency: boolean;
  createdAt: string;
}

export interface SalesPage {
  sales: SaleSummary[];
  nextCursor: string | null;
}

export interface SaleLine {
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  quantity: number;
  unitPriceTzs: number;
  lineTotalTzs: number;
  conversionFactor: number;
  normalizedQuantity: number;
  shortfallNormalized: number;
}

export interface SalePayment {
  paymentMethodId: string;
  methodName: string;
  methodKind: string;
  amountTzs: number;
  cashReceivedTzs: number | null;
  changeTzs: number | null;
  debtorName: string | null;
}

export interface SaleDetail {
  id: string;
  branchId: string;
  soldById: string;
  soldByName: string;
  deviceId: string | null;
  totalTzs: number;
  changeTzs: number;
  debtTzs: number;
  lines: SaleLine[];
  payments: SalePayment[];
  hasStockInconsistency: boolean;
  createdAt: string;
}

/**
 * A page of sales, newest first. Needs `VIEW_REPORTS`; the owner always has it.
 * Paging is keyset — hand back the `nextCursor` you were given.
 */
export function fetchSales(
  token: string,
  branchId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<SalesPage> {
  return apiRequest<SalesPage>(
    `/branches/${branchId}/sales${queryString({ limit: options.limit, cursor: options.cursor })}`,
    authorized(token),
  );
}

/** One sale, exactly as the customer was shown it. */
export function fetchSale(
  token: string,
  branchId: string,
  saleId: string,
): Promise<SaleDetail> {
  return apiRequest<SaleDetail>(`/branches/${branchId}/sales/${saleId}`, authorized(token));
}

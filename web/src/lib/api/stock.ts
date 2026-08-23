import { apiRequest } from './client';
import { authorized } from './request';

export interface StockUnitView {
  unitId: string;
  unitName: string;
  quantity: number;
  factorToBase: number;
}

export interface ProductStockView {
  productId: string;
  productName: string;
  branchId: string;
  /** The physical package state, largest first: 5 Cartons + 5 Pieces. */
  packages: StockUnitView[];
  normalizedQuantity: number;
  baseUnitId: string;
  baseUnitName: string;
}

/** Needs `VIEW_STOCK`; the owner always has it. */
export function fetchBranchStock(
  token: string,
  branchId: string,
): Promise<ProductStockView[]> {
  return apiRequest<ProductStockView[]>(`/branches/${branchId}/stock`, authorized(token));
}

/**
 * What a shopkeeper would recite, from what the engine stores.
 *
 * The normalized figure is deliberately not shown to anyone: doc 02 keeps
 * normalized mathematics away from the shop floor unless it explains an
 * operational outcome. `5 Carton + 5 Piece`, never `35`.
 */
export function describePackages(packages: StockUnitView[]): string {
  const held = packages.filter((entry) => entry.quantity !== 0);

  if (held.length === 0) {
    return 'Hakuna · None';
  }

  return held.map((entry) => `${entry.quantity} ${entry.unitName}`).join(' + ');
}

/** True when any packaging has gone negative — something to recount, not an error. */
export function needsRecount(stock: ProductStockView): boolean {
  return stock.packages.some((entry) => entry.quantity < 0);
}

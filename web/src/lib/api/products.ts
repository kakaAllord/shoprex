import { apiRequest } from './client';
import { authorized, queryString } from './request';

export interface ProductUnitView {
  id: string;
  name: string;
  /** Whole Tanzanian shillings. Null until the shop has priced it. */
  priceTzs: number | null;
  factorToBase: number;
  isBaseUnit: boolean;
  barcodes: string[];
}

export interface ProductView {
  id: string;
  name: string;
  isActive: boolean;
  units: ProductUnitView[];
  relationships: Array<{ parentUnitId: string; childUnitId: string; factor: number }>;
  baseUnitId: string;
  barcodes: string[];
  createdAt: string;
}

/** The most this shop's catalogue route will return in one call. */
export const PRODUCT_PAGE_LIMIT = 50;

/**
 * The catalogue.
 *
 * Two things about this route are worth knowing before reading the screen over
 * it. `GET /products` **hides discontinued items** by design — it feeds the
 * selling screen's suggestions — so the console's list shows what a shop
 * currently carries. And it caps at 50, which is right for a suggestion list
 * and tight for a catalogue: the products screen says so when it hits the cap
 * and points at the search box rather than truncating in silence.
 */
export function fetchProducts(token: string, query?: string): Promise<ProductView[]> {
  return apiRequest<ProductView[]>(
    `/products${queryString({ query, limit: PRODUCT_PAGE_LIMIT })}`,
    authorized(token),
  );
}

export function fetchProduct(token: string, productId: string): Promise<ProductView> {
  return apiRequest<ProductView>(`/products/${productId}`, authorized(token));
}

export interface CreateProductInput {
  name: string;
  units: Array<{ name: string; priceTzs?: number }>;
  relationships?: Array<{ parentUnit: string; childUnit: string; factor: number }>;
  barcode?: string;
}

export function createProduct(
  token: string,
  input: CreateProductInput,
): Promise<ProductView> {
  return apiRequest<ProductView>('/products', {
    method: 'POST',
    body: JSON.stringify(input),
    ...authorized(token),
  });
}

/** Renaming or discontinuing. Discontinuing never deletes — doc 02 §6. */
export function updateProduct(
  token: string,
  productId: string,
  input: { name?: string; isActive?: boolean },
): Promise<ProductView> {
  return apiRequest<ProductView>(`/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    ...authorized(token),
  });
}

/**
 * Repricing one packaging. What a completed sale says is untouched: every sale
 * line snapshotted its own price when it was rung up.
 */
export function updateProductUnit(
  token: string,
  productId: string,
  unitId: string,
  input: { name?: string; priceTzs?: number },
): Promise<ProductView> {
  return apiRequest<ProductView>(`/products/${productId}/units/${unitId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    ...authorized(token),
  });
}

export function attachBarcode(
  token: string,
  productId: string,
  barcode: string,
  productUnitId?: string,
): Promise<ProductView> {
  return apiRequest<ProductView>(`/products/${productId}/barcodes`, {
    method: 'POST',
    body: JSON.stringify({ barcode, ...(productUnitId ? { productUnitId } : {}) }),
    ...authorized(token),
  });
}

/** Unit names this shop already uses, most-used first. Feeds the unit picker. */
export function fetchUnitNames(token: string): Promise<string[]> {
  return apiRequest<string[]>('/products/unit-names', authorized(token));
}

import { apiRequest } from './client';
import { authorized, queryString } from './request';

export type PaymentMethodKind = 'CASH' | 'MOBILE_MONEY' | 'BANK' | 'DEBT' | 'OTHER';

export interface PaymentMethod {
  id: string;
  name: string;
  kind: PaymentMethodKind;
  isActive: boolean;
  sortOrder: number;
}

/**
 * What each kind actually does at the till. The kind is not a label — it
 * decides the arithmetic — so the settings screen says so before an owner
 * picks one, and cannot offer to change it afterwards.
 */
export const KIND_LABELS: Record<PaymentMethodKind, string> = {
  CASH: 'Taslimu · Cash — takes what was handed over and gives change',
  MOBILE_MONEY: 'Pesa ya simu · Mobile money — M-Pesa, Airtel Money, Tigo Pesa',
  BANK: 'Benki · Bank transfer or card',
  DEBT: 'Deni · Credit — records a name and what is owed',
  OTHER: 'Nyingine · Something else',
};

export const ALL_KINDS: PaymentMethodKind[] = [
  'CASH',
  'MOBILE_MONEY',
  'BANK',
  'DEBT',
  'OTHER',
];

/**
 * `includeInactive` is owners only, and the settings screen is the only caller
 * that passes it: a screen that cannot see a switched-off method is one that
 * cannot switch it back on.
 */
export function fetchPaymentMethods(
  token: string,
  includeInactive = false,
): Promise<PaymentMethod[]> {
  return apiRequest<PaymentMethod[]>(
    `/payment-methods${queryString({ includeInactive: includeInactive || undefined })}`,
    authorized(token),
  );
}

export function createPaymentMethod(
  token: string,
  input: { name: string; kind: PaymentMethodKind },
): Promise<PaymentMethod> {
  return apiRequest<PaymentMethod>('/payment-methods', {
    method: 'POST',
    body: JSON.stringify(input),
    ...authorized(token),
  });
}

/**
 * Renaming, reordering, or switching off. There is no delete, here or in the
 * backend: a method that has settled anything cannot go without taking a
 * receipt's meaning with it.
 */
export function updatePaymentMethod(
  token: string,
  methodId: string,
  input: { name?: string; isActive?: boolean; sortOrder?: number },
): Promise<PaymentMethod> {
  return apiRequest<PaymentMethod>(`/payment-methods/${methodId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    ...authorized(token),
  });
}

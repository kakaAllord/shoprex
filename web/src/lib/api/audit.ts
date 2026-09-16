import { apiRequest } from './client';
import { authorized } from './request';
import { queryString } from './request';

export type AuditAction =
  | 'BRANCH_CREATED'
  | 'MANAGER_CREATED'
  | 'WORKER_CREATED'
  | 'PERMISSIONS_CHANGED'
  | 'DEVICE_ENROLLMENT_ISSUED'
  | 'DEVICE_ENROLLED'
  | 'DEVICE_SIGNED_IN'
  | 'DEVICE_REVOKED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UNIT_ADDED'
  | 'STOCK_RECEIVED'
  | 'SALE_COMPLETED'
  | 'STOCK_INCONSISTENCY'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_PRICE_CHANGED'
  | 'BARCODE_ATTACHED'
  | 'PAYMENT_METHOD_CREATED'
  | 'PAYMENT_METHOD_UPDATED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'STAFF_DEACTIVATED'
  | 'STAFF_REACTIVATED';

export interface AuditEvent {
  id: string;
  action: AuditAction;
  summary: string;
  branchId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: 'PLATFORM_ADMIN' | 'OWNER' | 'MANAGER' | 'WORKER' | null;
  deviceId: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

/**
 * Who did what, from which phone, and when. Owner-only.
 *
 * The backend has recorded this since Phase 2 and nothing ever showed it, so
 * an owner asking "who dropped the price of sugar" had no way to find out
 * despite the answer sitting in the database.
 */
export type AuditScope = 'all' | 'notable';

/**
 * Who did what, from which phone, and when. Owner-only.
 *
 * `scope: 'notable'` leaves out the events a working shop produces by the
 * hundred — completed sales, received deliveries, device sign-ins. They are
 * not noise, they are the shop working; but a log they dominate is a log
 * nobody scans, and an owner opens this page to find the *unusual* thing.
 * The decision about which actions are routine lives in the backend, so the
 * two surfaces cannot come to disagree about it.
 */
export function fetchAuditEvents(
  token: string,
  options: { limit?: number; scope?: AuditScope; deviceId?: string } = {},
): Promise<AuditEvent[]> {
  return apiRequest<AuditEvent[]>(
    `/audit-events${queryString({
      limit: options.limit?.toString(),
      scope: options.scope,
      deviceId: options.deviceId,
    })}`,
    authorized(token),
  );
}

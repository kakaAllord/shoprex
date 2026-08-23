import { apiRequest } from './client';
import { authorized } from './request';

export type UserPermission = 'SELL' | 'RECEIVE_STOCK' | 'VIEW_STOCK' | 'VIEW_REPORTS';

/** Every permission the owner may grant, in the order the console shows them. */
export const ALL_PERMISSIONS: UserPermission[] = [
  'SELL',
  'RECEIVE_STOCK',
  'VIEW_STOCK',
  'VIEW_REPORTS',
];

/**
 * What each permission actually lets somebody do, in the words of the job
 * rather than the words of the enum. An owner ticking boxes should not have to
 * infer what `VIEW_REPORTS` covers from its name.
 */
export const PERMISSION_LABELS: Record<UserPermission, string> = {
  SELL: 'Kuuza · Sell at the counter',
  RECEIVE_STOCK: 'Kupokea mzigo · Receive deliveries',
  VIEW_STOCK: 'Kuona stoo · See what the branch holds',
  VIEW_REPORTS: 'Kuona mauzo · Browse the sales list',
};

export interface StaffMember {
  id: string;
  fullName: string;
  /** Null for workers: they sign in on a branch phone, not in this console. */
  email: string | null;
  phone: string | null;
  role: 'MANAGER' | 'WORKER';
  permissions: UserPermission[];
  branchIds: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function fetchStaff(token: string): Promise<StaffMember[]> {
  return apiRequest<StaffMember[]>('/users', authorized(token));
}

export interface CreateWorkerInput {
  fullName: string;
  password: string;
  branchId: string;
  permissions: UserPermission[];
  phone?: string;
}

/** A worker has no email: they never use this console. */
export function createWorker(
  token: string,
  input: CreateWorkerInput,
): Promise<StaffMember> {
  return apiRequest<StaffMember>('/users/workers', {
    method: 'POST',
    body: JSON.stringify(input),
    ...authorized(token),
  });
}

export interface CreateManagerInput {
  fullName: string;
  email: string;
  password: string;
  branchIds: string[];
  permissions: UserPermission[];
  phone?: string;
}

export function createManager(
  token: string,
  input: CreateManagerInput,
): Promise<StaffMember> {
  return apiRequest<StaffMember>('/users/managers', {
    method: 'POST',
    body: JSON.stringify(input),
    ...authorized(token),
  });
}

/**
 * Replaces a permission set outright rather than merging, exactly as the
 * backend does: a permission left out of the request is a permission taken
 * away. The form sends every box, ticked or not, for that reason.
 */
export function setPermissions(
  token: string,
  userId: string,
  permissions: UserPermission[],
): Promise<StaffMember> {
  return apiRequest<StaffMember>(`/users/${userId}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ permissions }),
    ...authorized(token),
  });
}

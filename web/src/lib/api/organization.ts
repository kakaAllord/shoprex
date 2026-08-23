import { apiRequest } from './client';
import { authorized } from './request';

export interface BranchView {
  id: string;
  businessId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface BusinessDetail {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
  branchCount: number;
  userCount: number;
  branches: { id: string; name: string; isActive: boolean }[];
}

export interface BusinessSummary {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
  branchCount: number;
  userCount: number;
}

/** Owner console: the caller business, scoped by the token on the server. */
export function fetchMyBusiness(token: string): Promise<BusinessDetail> {
  return apiRequest<BusinessDetail>('/businesses/me', authorized(token));
}

export function fetchMyBranches(token: string): Promise<BranchView[]> {
  return apiRequest<BranchView[]>('/branches', authorized(token));
}

/** Owner console: add a branch to the caller own business. */
export function createBranch(token: string, name: string): Promise<BranchView> {
  return apiRequest<BranchView>('/branches', {
    method: 'POST',
    body: JSON.stringify({ name }),
    ...authorized(token),
  });
}

/** Admin console: every shop on the platform. Rejected for any other role. */
export function fetchAllBusinesses(token: string): Promise<BusinessSummary[]> {
  return apiRequest<BusinessSummary[]>('/businesses', authorized(token));
}

export interface CreateBusinessInput {
  name: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPassword: string;
  timezone?: string;
}

/** Admin console: onboard a shop and its first owner in one action. */
export function createBusiness(
  token: string,
  input: CreateBusinessInput,
): Promise<BusinessDetail> {
  return apiRequest<BusinessDetail>('/businesses', {
    method: 'POST',
    body: JSON.stringify(input),
    ...authorized(token),
  });
}

/**
 * Admin console: suspend or restore a shop account.
 *
 * Suspending locks the shop immediately in every direction — nobody signs in,
 * no phone enrolls, and the tokens already in circulation are refused on their
 * very next request. **Nothing is deleted**, which is what makes it safe: the
 * products, stock, sales, and history are all still there when it is restored.
 */
export function setBusinessActive(
  token: string,
  businessId: string,
  isActive: boolean,
): Promise<BusinessDetail> {
  return apiRequest<BusinessDetail>(`/businesses/${businessId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
    ...authorized(token),
  });
}

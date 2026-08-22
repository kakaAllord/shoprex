import { apiRequest } from './client';

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

const authorized = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

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

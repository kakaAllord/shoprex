import { apiRequest } from './client';
import { authorized } from './request';

export interface DeviceView {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  status: 'ACTIVE' | 'REVOKED';
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * The one-time enrollment code, returned exactly once.
 *
 * The console shows it, tells the owner to write it down, and can never fetch
 * it again — the backend stores only a SHA-256 hash. Nothing in this app
 * persists it either.
 */
export interface IssuedEnrollment {
  enrollmentId: string;
  code: string;
  branchId: string;
  branchName: string;
  deviceName: string;
  expiresAt: string;
}

export function fetchDevices(token: string): Promise<DeviceView[]> {
  return apiRequest<DeviceView[]>('/devices', authorized(token));
}

export function issueEnrollment(
  token: string,
  branchId: string,
  deviceName: string,
): Promise<IssuedEnrollment> {
  return apiRequest<IssuedEnrollment>('/devices/enrollments', {
    method: 'POST',
    body: JSON.stringify({ branchId, deviceName }),
    ...authorized(token),
  });
}

/** Takes effect at the backend on the phone's very next request. */
export function revokeDevice(token: string, deviceId: string): Promise<DeviceView> {
  return apiRequest<DeviceView>(`/devices/${deviceId}/revoke`, {
    method: 'POST',
    ...authorized(token),
  });
}

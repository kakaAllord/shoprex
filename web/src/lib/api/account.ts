import { apiRequest } from './client';
import { authorized } from './request';

/**
 * Changing your own password.
 *
 * The current one is required by the backend and is not ceremony: without it,
 * a session token lifted from an unlocked browser becomes a permanent
 * takeover in one request.
 */
export function changeOwnPassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ changed: true }> {
  return apiRequest<{ changed: true }>('/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
    ...authorized(token),
  });
}

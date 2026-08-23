import type { ApiRequestOptions } from './client';

/**
 * The bearer header, in one place.
 *
 * It was written out in `organization.ts` and would have been written out
 * again in each of the six modules this phase adds. One spelling of "how a
 * server-side call carries the session" is worth having.
 */
export const authorized = (token: string): ApiRequestOptions => ({
  headers: { Authorization: `Bearer ${token}` },
});

/**
 * A query string built from only the parameters that have a value.
 *
 * `?limit=&cursor=undefined` is a real bug that reads as a typo, and the
 * backend refuses it with a 400 that looks like the console is broken.
 */
export function queryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }

  const rendered = search.toString();

  return rendered ? `?${rendered}` : '';
}

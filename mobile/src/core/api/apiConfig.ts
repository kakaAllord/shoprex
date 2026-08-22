/**
 * Where the Shoprex Android app finds its one backend.
 *
 * The address is configuration, not code: it comes from `mobile/.env` as
 * EXPO_PUBLIC_SHOPREX_API_BASE_URL and is embedded at build time. There is no
 * fallback on purpose — a missing address is a setup mistake that should be
 * loud, not a silent default pointing somewhere unexpected.
 *
 * See mobile/.env.example for the value to use on an emulator versus a
 * physical phone.
 */

export const API_BASE_URL = process.env.EXPO_PUBLIC_SHOPREX_API_BASE_URL ?? '';

export class MissingApiBaseUrlError extends Error {
  constructor() {
    super(
      'EXPO_PUBLIC_SHOPREX_API_BASE_URL is not set. Copy mobile/.env.example to mobile/.env and rebuild the development client.',
    );
    this.name = 'MissingApiBaseUrlError';
  }
}

export function requireApiBaseUrl(baseUrl: string = API_BASE_URL): string {
  if (!baseUrl) {
    throw new MissingApiBaseUrlError();
  }

  return baseUrl;
}

/**
 * Joins the configured base URL with an endpoint path, tolerating a trailing
 * slash on the base and a missing leading slash on the path.
 */
export function resolveApiUrl(path: string, baseUrl: string = API_BASE_URL): string {
  const base = requireApiBaseUrl(baseUrl).replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${base}${normalizedPath}`;
}

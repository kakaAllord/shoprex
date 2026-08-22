/**
 * The only way the Shoprex web app reaches data.
 *
 * Rules enforced here:
 *  - every call goes to the NestJS backend; the web app has no database access;
 *  - backend errors are surfaced in the shared Shoprex error envelope shape.
 */

export interface ShoprexApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

export class ShoprexApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: ShoprexApiErrorBody,
  ) {
    super(message);
    this.name = 'ShoprexApiError';
  }
}

/**
 * Server components use API_BASE_URL (can be an internal hostname);
 * browser code uses NEXT_PUBLIC_API_BASE_URL.
 */
export function resolveApiBaseUrl(
  env: Record<string, string | undefined> = process.env,
  isServer: boolean = typeof window === 'undefined',
): string {
  const base = isServer
    ? (env.API_BASE_URL ?? env.NEXT_PUBLIC_API_BASE_URL)
    : env.NEXT_PUBLIC_API_BASE_URL;

  if (!base) {
    throw new Error(
      'Shoprex API base URL is not configured. Set API_BASE_URL and NEXT_PUBLIC_API_BASE_URL in web/.env.local (see .env.example).',
    );
  }

  return base.replace(/\/+$/, '');
}

export function buildApiUrl(
  path: string,
  env: Record<string, string | undefined> = process.env,
  isServer: boolean = typeof window === 'undefined',
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveApiBaseUrl(env, isServer)}${normalizedPath}`;
}

export interface ApiRequestOptions extends RequestInit {
  /** Operational data must not be served from a stale cache by default. */
  revalidateSeconds?: number;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { revalidateSeconds, ...init } = options;

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init.headers,
    },
    ...(revalidateSeconds === undefined
      ? { cache: 'no-store' as RequestCache }
      : { next: { revalidate: revalidateSeconds } }),
  });

  const rawBody = await response.text();
  const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;

  if (!response.ok) {
    const body = parsed as ShoprexApiErrorBody | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `Request to ${path} failed`);

    throw new ShoprexApiError(response.status, message, body ?? undefined);
  }

  return parsed as T;
}

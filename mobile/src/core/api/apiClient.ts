import { API_BASE_URL, requireApiBaseUrl, resolveApiUrl } from './apiConfig';

/** Error envelope shared by every Shoprex backend response. */
export class ShoprexApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ShoprexApiError';
  }
}

/** Backend health as reported by GET /health/ready. */
export interface BackendHealth {
  status: string;
  service: string;
  version: string;
  environment: string;
  timezone: string;
  databaseStatus: string;
  databaseLatencyMs: number | null;
  databaseMessage: string | null;
}

export function isHealthy(health: BackendHealth): boolean {
  return health.status === 'ok' && health.databaseStatus === 'ok';
}

function toBackendHealth(json: Record<string, unknown>): BackendHealth {
  const database = (json.database ?? {}) as Record<string, unknown>;

  return {
    status: (json.status as string) ?? 'error',
    service: (json.service as string) ?? 'unknown',
    version: (json.version as string) ?? '0.0.0',
    environment: (json.environment as string) ?? 'unknown',
    timezone: (json.timezone as string) ?? 'unknown',
    databaseStatus: (database.status as string) ?? 'error',
    databaseLatencyMs: (database.latencyMs as number | null) ?? null,
    databaseMessage: (database.message as string | null) ?? null,
  };
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The single gateway between the Android app and the Shoprex backend.
 *
 * Shoprex V1 is online-only: there is no local queue, outbox, or background
 * synchronisation. Every authoritative action goes through this client.
 */
export class ApiClient {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  readonly baseUrl: string;

  constructor({ baseUrl, fetchFn, timeoutMs = 10_000 }: ApiClientOptions = {}) {
    // Fails here rather than at the first request, so a misconfigured build is
    // obvious immediately.
    this.baseUrl = requireApiBaseUrl(baseUrl ?? API_BASE_URL);
    this.fetchFn = fetchFn ?? fetch;
    this.timeoutMs = timeoutMs;
  }

  async getJson(path: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(resolveApiUrl(path, this.baseUrl), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      const text = await response.text();
      const body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;

      // 503 from /health/ready still carries a valid health payload.
      if (response.status >= 400 && response.status !== 503) {
        const message = body.message;

        throw new ShoprexApiError(
          response.status,
          Array.isArray(message) ? message.join(', ') : ((message as string) ?? 'Request failed'),
        );
      }

      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchHealth(): Promise<BackendHealth> {
    return toBackendHealth(await this.getJson('/health/ready'));
  }
}

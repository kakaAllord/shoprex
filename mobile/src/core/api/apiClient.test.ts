import { ApiClient, ShoprexApiError, isHealthy } from './apiClient';
import { MissingApiBaseUrlError, resolveApiUrl } from './apiConfig';

// Tests always pass an explicit address; nothing here depends on a .env value.
const baseUrl = 'http://api.test/api/v1';

/** Builds a fetch stub that answers once with the given body and status. */
function respondWith(body: unknown, status = 200): typeof fetch {
  return jest.fn().mockResolvedValue({
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('resolveApiUrl', () => {
  it('joins base URL and path without doubling slashes', () => {
    expect(resolveApiUrl('/health/ready', `${baseUrl}/`)).toBe(
      'http://api.test/api/v1/health/ready',
    );
  });

  it('accepts a path without a leading slash', () => {
    expect(resolveApiUrl('health', baseUrl)).toBe('http://api.test/api/v1/health');
  });

  it('refuses to build a URL when the address is not configured', () => {
    expect(() => resolveApiUrl('/health', '')).toThrow(MissingApiBaseUrlError);
  });

  it('fails loudly when a client is built without a configured address', () => {
    expect(() => new ApiClient({ baseUrl: '' })).toThrow(
      /EXPO_PUBLIC_SHOPREX_API_BASE_URL is not set/,
    );
  });
});

describe('ApiClient.fetchHealth', () => {
  it('parses a healthy backend response', async () => {
    const fetchFn = respondWith({
      status: 'ok',
      service: 'shoprex-backend',
      version: '0.1.0',
      environment: 'development',
      timezone: 'Africa/Dar_es_Salaam',
      database: { status: 'ok', latencyMs: 4 },
    });

    const client = new ApiClient({ baseUrl, fetchFn });
    const health = await client.fetchHealth();

    expect(isHealthy(health)).toBe(true);
    expect(health.service).toBe('shoprex-backend');
    expect(health.databaseLatencyMs).toBe(4);
    expect(fetchFn).toHaveBeenCalledWith(
      'http://api.test/api/v1/health/ready',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('parses a 503 readiness payload as reachable but unhealthy', async () => {
    const client = new ApiClient({
      baseUrl,
      fetchFn: respondWith(
        {
          status: 'error',
          service: 'shoprex-backend',
          database: { status: 'error', message: 'connection refused' },
        },
        503,
      ),
    });

    const health = await client.fetchHealth();

    expect(isHealthy(health)).toBe(false);
    expect(health.databaseMessage).toBe('connection refused');
  });

  it('throws ShoprexApiError on an unexpected error response', async () => {
    const client = new ApiClient({
      baseUrl,
      fetchFn: respondWith({ statusCode: 401, message: 'Unauthorized' }, 401),
    });

    await expect(client.fetchHealth()).rejects.toBeInstanceOf(ShoprexApiError);
  });

  it('reports the joined validation messages the backend returned', async () => {
    const client = new ApiClient({
      baseUrl,
      fetchFn: respondWith({ statusCode: 400, message: ['too short', 'not an email'] }, 400),
    });

    await expect(client.fetchHealth()).rejects.toThrow('too short, not an email');
  });

  it('surfaces a network failure rather than swallowing it', async () => {
    const client = new ApiClient({
      baseUrl,
      fetchFn: jest.fn().mockRejectedValue(new Error('Network request failed')) as unknown as typeof fetch,
    });

    await expect(client.fetchHealth()).rejects.toThrow('Network request failed');
  });
});

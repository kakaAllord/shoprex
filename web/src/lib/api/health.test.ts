import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBackendHealth } from './health';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

function stubEnv() {
  vi.stubEnv('API_BASE_URL', 'http://localhost:3001/api/v1');
}

describe('fetchBackendHealth', () => {
  it('returns the health payload when the backend is reachable', async () => {
    stubEnv();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'shoprex-backend',
          database: { status: 'ok', latencyMs: 3 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await fetchBackendHealth();

    expect(result.reachable).toBe(true);
    if (result.reachable) {
      expect(result.health.database.status).toBe('ok');
    }
  });

  it('treats a 503 from the backend as reachable but unhealthy', async () => {
    stubEnv();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'error',
          service: 'shoprex-backend',
          database: { status: 'error', latencyMs: null, message: 'connection refused' },
        }),
        { status: 503 },
      ),
    ) as unknown as typeof fetch;

    const result = await fetchBackendHealth();

    expect(result.reachable).toBe(true);
    if (result.reachable) {
      expect(result.health.database.status).toBe('error');
    }
  });

  it('reports unreachable instead of throwing when the request fails', async () => {
    stubEnv();
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('fetch failed')) as unknown as typeof fetch;

    const result = await fetchBackendHealth();

    expect(result.reachable).toBe(false);
    if (!result.reachable) {
      expect(result.reason).toContain('fetch failed');
    }
  });
});

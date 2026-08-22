import { describe, expect, it } from 'vitest';
import { buildApiUrl, resolveApiBaseUrl } from './client';

describe('Shoprex API client configuration', () => {
  it('prefers the server-side base URL when running on the server', () => {
    const base = resolveApiBaseUrl(
      {
        API_BASE_URL: 'http://shoprex-backend:3001/api/v1',
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
      },
      true,
    );

    expect(base).toBe('http://shoprex-backend:3001/api/v1');
  });

  it('falls back to the public base URL when only that is set', () => {
    expect(
      resolveApiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1' }, true),
    ).toBe('http://localhost:3001/api/v1');
  });

  it('never uses the server-only base URL in the browser', () => {
    expect(
      resolveApiBaseUrl(
        {
          API_BASE_URL: 'http://shoprex-backend:3001/api/v1',
          NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
        },
        false,
      ),
    ).toBe('http://localhost:3001/api/v1');
  });

  it('trims a trailing slash so paths never double up', () => {
    expect(buildApiUrl('/health', { API_BASE_URL: 'http://localhost:3001/api/v1/' }, true)).toBe(
      'http://localhost:3001/api/v1/health',
    );
  });

  it('accepts a path without a leading slash', () => {
    expect(buildApiUrl('health/ready', { API_BASE_URL: 'http://localhost:3001/api/v1' }, true)).toBe(
      'http://localhost:3001/api/v1/health/ready',
    );
  });

  it('fails loudly when no base URL is configured', () => {
    expect(() => resolveApiBaseUrl({}, true)).toThrow(/API base URL is not configured/);
  });
});

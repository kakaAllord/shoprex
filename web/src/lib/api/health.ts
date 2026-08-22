import { apiRequest, ShoprexApiError } from './client';

export interface BackendHealth {
  status: 'ok' | 'error';
  service: string;
  version: string;
  environment: string;
  timezone: string;
  uptimeSeconds: number;
  timestamp: string;
  database: {
    status: 'ok' | 'error';
    latencyMs: number | null;
    message?: string;
  };
}

export type BackendHealthResult =
  | { reachable: true; health: BackendHealth }
  | { reachable: false; reason: string };

/**
 * Never throws: the shell renders an explicit "backend unreachable" state
 * instead of a crashed page.
 */
export async function fetchBackendHealth(): Promise<BackendHealthResult> {
  try {
    const health = await apiRequest<BackendHealth>('/health/ready');
    return { reachable: true, health };
  } catch (error) {
    if (error instanceof ShoprexApiError && error.body) {
      const body = error.body as unknown as BackendHealth;
      if (body.service === 'shoprex-backend') {
        return { reachable: true, health: body };
      }
    }

    return {
      reachable: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

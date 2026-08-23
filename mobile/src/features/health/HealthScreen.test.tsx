import { render, screen, waitFor } from '@testing-library/react-native';
import { ApiClient } from '../../core/api/apiClient';
import { HealthScreen } from './HealthScreen';

// Phase 4 gave the app real screens, so the connection check is no longer what
// the app opens on — it is reached from Enrol and Sign in, for a phone that
// cannot see the shop's server. It is rendered directly here; the routing that
// gets to it is covered in App.test.tsx.

const baseUrl = 'http://api.test/api/v1';

function clientReturning(body: unknown, status = 200): ApiClient {
  return new ApiClient({
    baseUrl,
    fetchFn: jest.fn().mockResolvedValue({
      status,
      text: async () => JSON.stringify(body),
    }) as unknown as typeof fetch,
  });
}

const healthyPayload = {
  status: 'ok',
  service: 'shoprex-backend',
  version: '0.1.0',
  environment: 'development',
  timezone: 'Africa/Dar_es_Salaam',
  database: { status: 'ok', latencyMs: 3 },
};

describe('HealthScreen', () => {
  it('shows the healthy backend state', async () => {
    render(<HealthScreen apiClient={clientReturning(healthyPayload)} />);

    expect(screen.getByText('Karibu Shoprex')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/Backend healthy/)).toBeTruthy();
    });

    expect(screen.getByText('shoprex-backend')).toBeTruthy();
  });

  it('warns when the backend answers but its database is down', async () => {
    const client = clientReturning(
      {
        status: 'error',
        service: 'shoprex-backend',
        database: { status: 'error', message: 'connection refused' },
      },
      503,
    );

    render(<HealthScreen apiClient={client} />);

    await waitFor(() => {
      expect(screen.getByText(/Database down/)).toBeTruthy();
    });
  });

  it('shows an explicit unreachable state instead of a blank screen', async () => {
    const client = new ApiClient({
      baseUrl,
      fetchFn: jest
        .fn()
        .mockRejectedValue(new Error('Connection refused')) as unknown as typeof fetch,
    });

    render(<HealthScreen apiClient={client} />);

    await waitFor(() => {
      expect(screen.getByText(/Backend unreachable/)).toBeTruthy();
    });

    // The address is shown so a tester can see which backend was attempted.
    expect(screen.getByText(`Anwani · Address: ${baseUrl}`)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeTruthy();
  });
});

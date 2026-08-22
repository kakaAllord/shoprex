import { render, screen, waitFor } from '@testing-library/react-native';
import App from '../../app/App';
import { ApiClient } from '../../core/api/apiClient';

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
    render(<App apiClient={clientReturning(healthyPayload)} />);

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

    render(<App apiClient={client} />);

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

    render(<App apiClient={client} />);

    await waitFor(() => {
      expect(screen.getByText(/Backend unreachable/)).toBeTruthy();
    });

    // The address is shown so a tester can see which backend was attempted.
    expect(screen.getByText(`Anwani · Address: ${baseUrl}`)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeTruthy();
  });
});

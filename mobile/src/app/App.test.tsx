import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from './App';
import { ApiClient } from '../core/api/apiClient';
import { SessionStore, inMemoryStorage } from '../core/session/sessionStore';

/**
 * What the app opens on, and how a session ends.
 *
 * These are the routing decisions that decide whether a worker can work at
 * all: a fresh install must ask to be enrolled, an enrolled one must ask for a
 * password, and a phone whose device the owner revoked must be sent back to
 * sign-in with the backend's own words rather than left on a screen it can no
 * longer use.
 */
const baseUrl = 'http://api.test/api/v1';

/** The people this phone offers, before anybody has signed in. */
const people = [
  { userId: 'worker-1', fullName: 'Juma Hassan' },
  { userId: 'worker-2', fullName: 'Neema Said' },
];

const profile = {
  id: 'worker-1',
  fullName: 'Juma Hassan',
  role: 'WORKER',
  businessId: 'shop-1',
  businessName: 'Duka la Mfano',
  permissions: ['SELL'],
  deviceId: 'device-1',
  branchIds: ['branch-1'],
};

/** A fetch stub that answers each path from a small table. */
function routing(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return jest.fn(async (url: string) => {
    const match = Object.entries(routes).find(([path]) => String(url).includes(path));
    const answer = match?.[1] ?? { status: 404, body: { message: 'Not found' } };

    return {
      status: answer.status ?? 200,
      text: async () => JSON.stringify(answer.body),
    };
  }) as unknown as typeof fetch;
}

const clientWith = (fetchFn: typeof fetch, accessToken: string | null = null) =>
  new ApiClient({ baseUrl, fetchFn, accessToken });

/** The sign-in name list, as the backend returns it. */
const body = people;

describe('what the app opens on', () => {
  it('asks a fresh install to be enrolled', async () => {
    render(
      <App
        apiClient={clientWith(routing({}))}
        sessionStore={new SessionStore(inMemoryStorage())}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('enroll-code')).toBeTruthy();
    });
  });

  it('asks an enrolled phone with no session who is signing in', async () => {
    // The phone belongs to a branch, so it cannot know who is holding it. It
    // offers the people who work there and asks for a password second.
    render(
      <App
        apiClient={clientWith(routing({ '/people': { body } }))}
        sessionStore={new SessionStore(inMemoryStorage({ 'shoprex.device_id': 'device-1' }))}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-person-worker-1')).toBeTruthy();
    });

    expect(screen.getByText('Juma Hassan')).toBeTruthy();
    expect(screen.getByText('Neema Said')).toBeTruthy();
    // Nothing is asked for until a name is chosen.
    expect(screen.queryByTestId('login-password')).toBeNull();

    fireEvent.press(screen.getByTestId('login-person-worker-1'));

    await waitFor(() => {
      expect(screen.getByTestId('login-password')).toBeTruthy();
    });
  });

  it('lets a second person sign in on the same phone', async () => {
    // The whole point of the shared-device change: Juma's handset is flat, so
    // Neema picks up the counter phone and carries on.
    const fetchFn = routing({
      '/people': { body },
      '/auth/device/login': {
        body: { accessToken: 'token-2', user: { ...profile, id: 'worker-2', fullName: 'Neema Said' } },
      },
    });

    render(
      <App
        apiClient={clientWith(fetchFn)}
        sessionStore={new SessionStore(inMemoryStorage({ 'shoprex.device_id': 'device-1' }))}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('login-person-worker-2')).toBeTruthy());

    fireEvent.press(screen.getByTestId('login-person-worker-2'));
    fireEvent.changeText(screen.getByTestId('login-password'), 'shoprex12345');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(screen.getByText('Karibu, Neema Said')).toBeTruthy();
    });
  });

  it('sends the chosen person, not just the device', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const fetchFn = jest.fn(async (url: string, init?: { body?: string }) => {
      if (init?.body) {
        sent.push({ url: String(url), ...JSON.parse(init.body) });
      }

      if (String(url).includes('/people')) {
        return { status: 200, text: async () => JSON.stringify(people) };
      }

      return {
        status: 200,
        text: async () => JSON.stringify({ accessToken: 'token-1', user: profile }),
      };
    }) as unknown as typeof fetch;

    render(
      <App
        apiClient={clientWith(fetchFn)}
        sessionStore={new SessionStore(inMemoryStorage({ 'shoprex.device_id': 'device-1' }))}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('login-person-worker-1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('login-person-worker-1'));
    fireEvent.changeText(screen.getByTestId('login-password'), 'shoprex12345');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(sent.some((request) => request.userId === 'worker-1')).toBe(true);
    });

    const login = sent.find((request) => String(request.url).includes('/auth/device/login'));

    expect(login).toMatchObject({
      deviceId: 'device-1',
      userId: 'worker-1',
      password: 'shoprex12345',
    });
  });

  it('goes straight to work when the stored session is still good', async () => {
    render(
      <App
        apiClient={clientWith(routing({ '/auth/me': { body: profile } }))}
        sessionStore={
          new SessionStore(
            inMemoryStorage({
              'shoprex.device_id': 'device-1',
              'shoprex.access_token': 'token-1',
            }),
          )
        }
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-open-sale')).toBeTruthy();
    });

    expect(screen.getByText('Karibu, Juma Hassan')).toBeTruthy();
  });

  it('never trusts a stored token without asking the backend about it', async () => {
    // The device may have been revoked since the app was last open, so the
    // token alone is not enough to show the home screen.
    const fetchFn = routing({
      '/auth/me': {
        status: 401,
        body: { message: 'Kifaa hiki kimefutwa · This device has been revoked.' },
      },
    });

    render(
      <App
        apiClient={clientWith(fetchFn)}
        sessionStore={
          new SessionStore(
            inMemoryStorage({
              'shoprex.device_id': 'device-1',
              'shoprex.access_token': 'stale-token',
            }),
          )
        }
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-notice')).toBeTruthy();
    });

    expect(screen.getByText(/This device has been revoked/)).toBeTruthy();
  });

  it('opens Pokea mzigo and Stoo, and both come back home', async () => {
    // The app fans out from home to three places and returns from all of them.
    // A screen you can reach and not leave is a dead end, however good it is.
    const stocked = { ...profile, permissions: ['SELL', 'RECEIVE_STOCK', 'VIEW_STOCK'] };

    render(
      <App
        apiClient={clientWith(
          routing({ '/auth/me': { body: stocked }, '/stock': { body: [] } }),
        )}
        sessionStore={
          new SessionStore(
            inMemoryStorage({
              'shoprex.device_id': 'device-1',
              'shoprex.access_token': 'token-1',
            }),
          )
        }
      />,
    );

    await waitFor(() => expect(screen.getByTestId('home-open-receive')).toBeTruthy());

    fireEvent.press(screen.getByTestId('home-open-receive'));
    expect(screen.getByTestId('receive-search')).toBeTruthy();

    fireEvent.press(screen.getByTestId('receive-back'));
    await waitFor(() => expect(screen.getByTestId('home-open-stock')).toBeTruthy());

    fireEvent.press(screen.getByTestId('home-open-stock'));
    await waitFor(() => expect(screen.getByTestId('stock-refresh')).toBeTruthy());

    fireEvent.press(screen.getByTestId('stock-back'));
    await waitFor(() => expect(screen.getByTestId('home-open-sale')).toBeTruthy());
  });

  it('offers no way into either screen when neither is granted', async () => {
    // Hiding a tile is not authorization — the backend refuses both routes
    // regardless — but the phone should not point at a door that is shut.
    render(
      <App
        apiClient={clientWith(routing({ '/auth/me': { body: profile } }))}
        sessionStore={
          new SessionStore(
            inMemoryStorage({
              'shoprex.device_id': 'device-1',
              'shoprex.access_token': 'token-1',
            }),
          )
        }
      />,
    );

    await waitFor(() => expect(screen.getByTestId('home-open-sale')).toBeTruthy());

    expect(screen.queryByTestId('home-open-receive')).toBeNull();
    expect(screen.queryByTestId('home-open-stock')).toBeNull();
  });

  it('forgets the token but not the enrolment when the session ends', async () => {
    const storage = inMemoryStorage({
      'shoprex.device_id': 'device-1',
      'shoprex.access_token': 'stale-token',
    });

    render(
      <App
        apiClient={clientWith(
          routing({ '/auth/me': { status: 401, body: { message: 'no' } }, '/people': { body } }),
        )}
        sessionStore={new SessionStore(storage)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-person-worker-1')).toBeTruthy();
    });

    expect(await storage.getItemAsync('shoprex.access_token')).toBeNull();
    // Still this worker's phone: the enrolment survives a sign-out.
    expect(await storage.getItemAsync('shoprex.device_id')).toBe('device-1');
  });
});

describe('enrolling a phone', () => {
  it('stores the device id the backend minted and moves on to sign-in', async () => {
    const storage = inMemoryStorage();
    const fetchFn = routing({
      '/devices/enroll': {
        body: {
          deviceId: 'minted-device-9',
          deviceName: 'Simu ya kaunta',
          branchName: 'Tawi Kuu',
        },
      },
      '/people': { body },
    });

    render(<App apiClient={clientWith(fetchFn)} sessionStore={new SessionStore(storage)} />);

    await waitFor(() => {
      expect(screen.getByTestId('enroll-code')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('enroll-code'), 'ABCD-EFGH-JKLM');
    fireEvent.press(screen.getByTestId('enroll-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('login-person-worker-1')).toBeTruthy();
    });

    expect(await storage.getItemAsync('shoprex.device_id')).toBe('minted-device-9');
  });

  it('says why enrolment failed rather than doing nothing', async () => {
    const fetchFn = routing({
      '/devices/enroll': { status: 401, body: { message: 'Namba si sahihi · Code not valid' } },
    });

    render(
      <App apiClient={clientWith(fetchFn)} sessionStore={new SessionStore(inMemoryStorage())} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('enroll-code')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('enroll-code'), 'ZZZZ-ZZZZ-ZZZZ');
    fireEvent.press(screen.getByTestId('enroll-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('enroll-error')).toBeTruthy();
    });

    expect(screen.getByText(/Code not valid/)).toBeTruthy();
  });
});

describe('a phone that cannot see its shop', () => {
  it('offers the connection check from the enrolment screen', async () => {
    render(
      <App
        apiClient={clientWith(routing({ '/health/ready': { body: { status: 'ok' } } }))}
        sessionStore={new SessionStore(inMemoryStorage())}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('enroll-check-connection')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('enroll-check-connection'));

    await waitFor(() => {
      expect(screen.getByText('Karibu Shoprex')).toBeTruthy();
    });

    // And back again — the check is not a place to get stuck.
    fireEvent.press(screen.getByTestId('health-back'));

    await waitFor(() => {
      expect(screen.getByTestId('enroll-code')).toBeTruthy();
    });
  });

  it('lets a revoked phone be enrolled again instead of stranding it', async () => {
    const storage = inMemoryStorage({ 'shoprex.device_id': 'revoked-device' });

    render(
      <App
        apiClient={clientWith(routing({ '/people': { body } }))}
        sessionStore={new SessionStore(storage)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-forget-device')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('login-forget-device'));

    await waitFor(() => {
      expect(screen.getByTestId('enroll-code')).toBeTruthy();
    });

    expect(await storage.getItemAsync('shoprex.device_id')).toBeNull();
  });
});

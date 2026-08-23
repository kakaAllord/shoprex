import * as SecureStore from 'expo-secure-store';

/**
 * What this installation remembers between launches.
 *
 * Two things, and deliberately only two: the `device_id` the backend minted at
 * enrollment, and the access token from the last sign-in. Doc 02 §3 asks for
 * the device credential to be stored *securely*, so both live in Android's
 * keystore-backed store rather than in ordinary app storage.
 *
 * Note what is **not** here. No cart, no queued sale, no cached catalogue.
 * V1 is online-only, and a phone that quietly kept a sale to send later would
 * be an offline queue by another name — see AGENT.md.
 */

const DEVICE_ID_KEY = 'shoprex.device_id';
const ACCESS_TOKEN_KEY = 'shoprex.access_token';

/**
 * The narrow slice of SecureStore this module uses, so tests can supply an
 * in-memory one instead of reaching for a native module that is not there.
 */
export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export function inMemoryStorage(seed: Record<string, string> = {}): SecureStorage {
  const store = new Map(Object.entries(seed));

  return {
    getItemAsync: async (key) => store.get(key) ?? null,
    setItemAsync: async (key, value) => {
      store.set(key, value);
    },
    deleteItemAsync: async (key) => {
      store.delete(key);
    },
  };
}

export interface StoredSession {
  deviceId: string | null;
  accessToken: string | null;
}

export class SessionStore {
  constructor(private readonly storage: SecureStorage = SecureStore) {}

  async load(): Promise<StoredSession> {
    // A read that throws — a keystore the OS will not open, a device with no
    // secure hardware — must not stop the app from starting. It means "we
    // remember nothing", which is a state the app already handles: enroll.
    try {
      const [deviceId, accessToken] = await Promise.all([
        this.storage.getItemAsync(DEVICE_ID_KEY),
        this.storage.getItemAsync(ACCESS_TOKEN_KEY),
      ]);

      return { deviceId, accessToken };
    } catch {
      return { deviceId: null, accessToken: null };
    }
  }

  async saveDeviceId(deviceId: string): Promise<void> {
    await this.storage.setItemAsync(DEVICE_ID_KEY, deviceId);
  }

  async saveAccessToken(token: string): Promise<void> {
    await this.storage.setItemAsync(ACCESS_TOKEN_KEY, token);
  }

  /** Signs out but keeps the enrollment: the phone is still this worker's. */
  async clearAccessToken(): Promise<void> {
    await this.storage.deleteItemAsync(ACCESS_TOKEN_KEY);
  }

  /**
   * Forgets the enrollment as well. Used when the backend says the device is
   * revoked — keeping the id would only let the app keep asking a question
   * whose answer will not change until the owner enrolls the phone again.
   */
  async clearAll(): Promise<void> {
    await Promise.all([this.clearAccessToken(), this.storage.deleteItemAsync(DEVICE_ID_KEY)]);
  }
}

/**
 * A key that makes a retried sale the *same* sale.
 *
 * It only has to be unique, not unguessable: the backend scopes it to one
 * business, and the device id already separates two phones in the same shop
 * ringing up at the same millisecond. That is deliberate — reaching for a
 * cryptographic random here would mean another native dependency for no gain.
 */
export function newIdempotencyKey(deviceId: string | null, counter: number): string {
  return `${deviceId ?? 'no-device'}:${Date.now()}:${counter}`;
}

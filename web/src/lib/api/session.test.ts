import { afterEach, describe, expect, it, vi } from 'vitest';

const cookieStore = { get: vi.fn() };

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}));

const fetchProfile = vi.fn();

vi.mock('./auth', () => ({
  fetchProfile: (token: string) => fetchProfile(token),
}));

const { currentProfile, readSessionToken, SESSION_COOKIE } = await import('./session');
const { ShoprexApiError } = await import('./client');

const signedIn = (token = 'a.b.c') => {
  cookieStore.get.mockReturnValue({ value: token });
};

afterEach(() => {
  cookieStore.get.mockReset();
  fetchProfile.mockReset();
});

describe('readSessionToken', () => {
  it('reads the httpOnly session cookie and nothing else', async () => {
    signedIn('token-123');

    await expect(readSessionToken()).resolves.toBe('token-123');
    expect(cookieStore.get).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it('is null when there is no cookie', async () => {
    cookieStore.get.mockReturnValue(undefined);

    await expect(readSessionToken()).resolves.toBeNull();
  });
});

describe('currentProfile', () => {
  it('returns the profile the backend gave it', async () => {
    signedIn();
    fetchProfile.mockResolvedValue({ fullName: 'Mmiliki', console: 'owner' });

    await expect(currentProfile()).resolves.toMatchObject({ console: 'owner' });
  });

  it('is null with no cookie, without calling the backend', async () => {
    cookieStore.get.mockReturnValue(undefined);

    await expect(currentProfile()).resolves.toBeNull();
    expect(fetchProfile).not.toHaveBeenCalled();
  });

  it('treats a 401 as signed out', async () => {
    signedIn();
    fetchProfile.mockRejectedValue(new ShoprexApiError(401, 'Invalid or expired token'));

    await expect(currentProfile()).resolves.toBeNull();
  });

  it('treats a 403 as signed out too — that is the suspended-shop answer', async () => {
    signedIn();
    fetchProfile.mockRejectedValue(
      new ShoprexApiError(403, 'This shop account has been suspended'),
    );

    await expect(currentProfile()).resolves.toBeNull();
  });

  it('does NOT treat a rate limit as a sign-out', async () => {
    // The bug this test exists for: any failure used to mean "signed out", so
    // a rate-limited owner was bounced to the sign-in page and invited to
    // retype a password that was never the problem.
    signedIn();
    fetchProfile.mockRejectedValue(new ShoprexApiError(429, 'Too Many Requests'));

    await expect(currentProfile()).rejects.toThrow(ShoprexApiError);
  });

  it('does NOT treat an unreachable backend as a sign-out', async () => {
    signedIn();
    fetchProfile.mockRejectedValue(new TypeError('fetch failed'));

    await expect(currentProfile()).rejects.toThrow(TypeError);
  });
});

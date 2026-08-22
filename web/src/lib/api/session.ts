import { cookies } from 'next/headers';
import { AuthProfile, fetchProfile } from './auth';

export const SESSION_COOKIE = 'shoprex_session';

/**
 * The access token lives in an httpOnly cookie, so page scripts cannot read it
 * and every authenticated call is made server-side.
 */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function currentProfile(): Promise<AuthProfile | null> {
  const token = await readSessionToken();

  if (!token) {
    return null;
  }

  try {
    return await fetchProfile(token);
  } catch {
    // Expired or revoked token: treat as signed out rather than crashing.
    return null;
  }
}

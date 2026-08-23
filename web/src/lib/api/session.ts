import { cookies } from 'next/headers';
import { AuthProfile, fetchProfile } from './auth';
import { ShoprexApiError } from './client';

export const SESSION_COOKIE = 'shoprex_session';

/**
 * The access token lives in an httpOnly cookie, so page scripts cannot read it
 * and every authenticated call is made server-side.
 */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Who is signed in, or null if nobody is.
 *
 * **Null means signed out and nothing else.** It used to mean "the profile
 * call failed for any reason at all", which quietly turned every backend
 * hiccup into a sign-out: a rate-limited owner, or one whose backend was down
 * for a second, was bounced to the sign-in page as though their session had
 * expired — and signing in again did not help, because nothing was wrong with
 * their session.
 *
 * So only a `401` counts as signed out. A `403` counts too, and means
 * something specific: the account is fine and the *shop* has been suspended,
 * which the sign-in page is the right place to say. Anything else throws, and
 * the caller renders it as the failure it is.
 */
export async function currentProfile(): Promise<AuthProfile | null> {
  const token = await readSessionToken();

  if (!token) {
    return null;
  }

  try {
    return await fetchProfile(token);
  } catch (error) {
    if (error instanceof ShoprexApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }

    throw error;
  }
}

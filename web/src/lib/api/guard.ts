import { redirect } from 'next/navigation';
import { AuthProfile, ConsoleName, consolePath } from './auth';
import { currentProfile, readSessionToken } from './session';

export interface ConsoleSession {
  profile: AuthProfile;
  token: string;
}

/**
 * "Is the person looking at this page allowed to be here?" — asked once.
 *
 * Ten pages doing this by hand is ten chances to forget a redirect, and the
 * one that forgets is a page that renders a stranger's console before the
 * backend gets around to refusing the data. It is worth saying plainly that
 * this is **not** the authorization: the backend enforces tenant, branch,
 * role, and permission on every request no matter what this returns. What this
 * buys is that somebody in the wrong console sees their own instead of an
 * error.
 *
 * A backend that cannot answer is **not** treated as a sign-out. Sending
 * somebody to the sign-in page because the API was briefly unreachable tells
 * them a lie about their session and invites them to type a password that was
 * never the problem; `?problem=backend` is how the sign-in page says what
 * actually happened.
 */
export async function requireConsole(expected: ConsoleName): Promise<ConsoleSession> {
  let profile: AuthProfile | null;

  try {
    profile = await currentProfile();
  } catch {
    redirect('/login?problem=backend');
  }

  if (!profile) {
    redirect('/login');
  }

  if (profile.console !== expected) {
    redirect(consolePath(profile.console));
  }

  const token = await readSessionToken();

  if (!token) {
    redirect('/login');
  }

  return { profile, token };
}

/**
 * True when this person may take owner-only actions.
 *
 * Managers share the owner console — doc 01 §3 gives them a delegated slice of
 * it — so a page has to know which of the two is reading it. Every screen that
 * uses this pairs it with a written explanation rather than a disabled button:
 * a control that is visible and dead teaches somebody that Shoprex is broken,
 * while a sentence saying the owner does this teaches them who to ask.
 */
export function isOwner(profile: AuthProfile): boolean {
  return profile.role === 'OWNER';
}

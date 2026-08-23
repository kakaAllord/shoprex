import { redirect } from 'next/navigation';
import { consolePath } from '../lib/api/auth';
import { currentProfile } from '../lib/api/session';

export const dynamic = 'force-dynamic';

/**
 * The root is a signpost, not a page: signed-in users land in their own
 * console, everyone else goes to sign-in.
 */
export default async function HomePage() {
  try {
    const profile = await currentProfile();

    redirect(profile ? consolePath(profile.console) : '/login');
  } catch (error) {
    // `redirect` works by throwing, so it must be allowed through.
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }

    // A backend that could not answer is not a sign-out. Say which it was.
    redirect('/login?problem=backend');
  }
}

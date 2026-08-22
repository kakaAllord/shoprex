import { redirect } from 'next/navigation';
import { consolePath } from '../lib/api/auth';
import { currentProfile } from '../lib/api/session';

export const dynamic = 'force-dynamic';

/**
 * The root is a signpost, not a page: signed-in users land in their own
 * console, everyone else goes to sign-in.
 */
export default async function HomePage() {
  const profile = await currentProfile();

  redirect(profile ? consolePath(profile.console) : '/login');
}

import { LoadingState } from '@/components/states';

/**
 * What the owner console shows while a page is fetching.
 *
 * Every screen under `/owner` is a server component that awaits the backend
 * before it renders anything at all, so until Phase 8 a slow connection meant
 * the browser sat on the *previous* page showing no sign that a navigation had
 * started. On a shop's connection that is several seconds of a person deciding
 * their tap did not register — and tapping again.
 *
 * Next renders this the instant a navigation into this segment begins, which
 * is exactly the gap.
 */
export default function OwnerLoading() {
  return (
    <main className="flex min-h-svh flex-col gap-4 p-4 md:p-6">
      <LoadingState label="Inapakia · Loading…" rows={4} />
    </main>
  );
}

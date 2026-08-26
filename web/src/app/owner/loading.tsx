import { LoadingState } from '../../components/states';

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
 * is exactly the gap. It sits below the shell rather than replacing it, so the
 * navigation stays on screen and the reader can change their mind.
 */
export default function OwnerLoading() {
  return (
    <main className="shoprex-shell shoprex-shell--wide">
      <LoadingState label="Inapakia · Loading…" rows={4} />
    </main>
  );
}

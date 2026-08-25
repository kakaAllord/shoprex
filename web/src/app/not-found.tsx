/**
 * A page that is not there.
 *
 * Reached by a mistyped address, a stale bookmark, or a `notFound()` from a
 * screen whose record no longer exists. Next's default is an unstyled English
 * "404 — This page could not be found", which in a Swahili-first console reads
 * as the application having broken rather than as a wrong address.
 *
 * No retry here, deliberately: retrying an address that does not exist answers
 * the same way. The only useful move is somewhere that does exist, and `/`
 * already knows which console the reader belongs to.
 */
export default function NotFound() {
  return (
    <main className="shoprex-shell">
      <div className="shoprex-state">
        <p className="shoprex-state__title">Ukurasa haupo · This page does not exist</p>
        <p className="shoprex-state__hint">
          Anwani hii si sahihi, au kitu ulichokuwa unatafuta kimeondolewa · The address is wrong,
          or what it pointed at has been removed.
        </p>
        <div className="shoprex-state__actions">
          <a className="shoprex-linkbutton" href="/">
            Rudi mwanzo · Back to the start
          </a>
        </div>
      </div>
    </main>
  );
}

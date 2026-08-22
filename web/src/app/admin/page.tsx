import { redirect } from 'next/navigation';
import { ConsoleHeader } from '../../components/console-header';
import { consolePath } from '../../lib/api/auth';
import { fetchAllBusinesses } from '../../lib/api/organization';
import { currentProfile, readSessionToken } from '../../lib/api/session';

export const dynamic = 'force-dynamic';

/** Platform administrator console: every shop account on Shoprex. */
export default async function AdminPage() {
  const profile = await currentProfile();

  if (!profile) {
    redirect('/login');
  }

  // A non-admin who types /admin is sent to their own console; the backend
  // would reject the data request anyway.
  if (profile.console !== 'admin') {
    redirect(consolePath(profile.console));
  }

  const token = (await readSessionToken())!;
  const businesses = await fetchAllBusinesses(token);

  return (
    <main className="shoprex-shell">
      <ConsoleHeader profile={profile} />

      <h1 className="shoprex-title">Maduka yote</h1>
      <p className="shoprex-lede">
        Akaunti za maduka kwenye jukwaa la Shoprex. Kuunda duka jipya na mmiliki wake
        kutaongezwa hapa. Shop accounts on the platform — creating a shop and its
        owner from this screen arrives with the rest of Phase 1.
      </p>

      <section className="shoprex-card">
        <h2 className="shoprex-card__title">Maduka · Businesses ({businesses.length})</h2>

        {businesses.length === 0 ? (
          <p className="shoprex-note" style={{ marginTop: 0 }}>
            Hakuna duka bado · No businesses yet.
          </p>
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Shoprex · Business</th>
                  <th>Matawi</th>
                  <th>Watumiaji</th>
                  <th>Saa za eneo</th>
                  <th>Hali</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => (
                  <tr key={business.id}>
                    <td>{business.name}</td>
                    <td>{business.branchCount}</td>
                    <td>{business.userCount}</td>
                    <td>{business.timezone}</td>
                    <td>
                      <span
                        className={
                          business.isActive
                            ? 'shoprex-status shoprex-status--ok'
                            : 'shoprex-status shoprex-status--warn'
                        }
                      >
                        {business.isActive ? 'Hai · Active' : 'Imesimamishwa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

import { redirect } from 'next/navigation';
import { BranchForm } from '../../components/branch-form';
import { ConsoleHeader } from '../../components/console-header';
import { consolePath } from '../../lib/api/auth';
import { fetchMyBranches, fetchMyBusiness } from '../../lib/api/organization';
import { currentProfile, readSessionToken } from '../../lib/api/session';

export const dynamic = 'force-dynamic';

/** Owner console: one business, scoped on the server by the session token. */
export default async function OwnerPage() {
  const profile = await currentProfile();

  if (!profile) {
    redirect('/login');
  }

  if (profile.console !== 'owner') {
    redirect(consolePath(profile.console));
  }

  const token = (await readSessionToken())!;
  const [business, branches] = await Promise.all([
    fetchMyBusiness(token),
    fetchMyBranches(token),
  ]);

  return (
    <main className="shoprex-shell">
      <ConsoleHeader profile={profile} />

      <h1 className="shoprex-title">{business.name}</h1>
      <p className="shoprex-lede">
        Muhtasari wa duka lako. Bidhaa, stoo, wafanyakazi, vifaa na ripoti
        zitajengwa katika awamu zinazofuata. Your shop overview — products, stock,
        workers, devices, and reports arrive in later phases.
      </p>

      <section className="shoprex-card">
        <h2 className="shoprex-card__title">Shoprex · Business</h2>
        <dl className="shoprex-kv">
          <dt>Jina · Name</dt>
          <dd>{business.name}</dd>
          <dt>Saa za eneo · Timezone</dt>
          <dd>{business.timezone}</dd>
          <dt>Sarafu · Currency</dt>
          <dd>{business.currency}</dd>
          <dt>Watumiaji · Users</dt>
          <dd>{business.userCount}</dd>
        </dl>
      </section>

      <section className="shoprex-card">
        <h2 className="shoprex-card__title">Matawi · Branches ({branches.length})</h2>

        {branches.length === 0 ? (
          <p className="shoprex-note" style={{ marginTop: 0 }}>
            Hakuna tawi bado · No branches yet. Ongeza tawi lako la kwanza hapa chini.
          </p>
        ) : (
          <ul className="shoprex-list">
            {branches.map((branch) => (
              <li key={branch.id}>
                <span>{branch.name}</span>
                <span
                  className={
                    branch.isActive
                      ? 'shoprex-status shoprex-status--ok'
                      : 'shoprex-status shoprex-status--warn'
                  }
                >
                  {branch.isActive ? 'Hai · Active' : 'Imesimamishwa'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <BranchForm />
      </section>
    </main>
  );
}

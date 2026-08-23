import Link from 'next/link';
import { BranchForm } from '../../../components/branch-form';
import { ConsoleShell } from '../../../components/console-shell';
import { EmptyState, ErrorState, OwnerOnlyNote, Panel } from '../../../components/states';
import { day } from '../../../lib/format';
import { isOwner, requireConsole } from '../../../lib/api/guard';
import { fetchMyBranches } from '../../../lib/api/organization';

export const dynamic = 'force-dynamic';

/**
 * The branch overview.
 *
 * `GET /branches` already scopes itself: an owner gets every branch of their
 * business, a manager gets only the ones they are assigned to. This page never
 * filters — it renders what the backend was willing to say.
 */
export default async function BranchesPage() {
  const { profile, token } = await requireConsole('owner');

  let branches;

  try {
    branches = await fetchMyBranches(token);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/branches" title="Matawi">
        <ErrorState error={error} retryHref="/owner/branches" />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/branches"
      title="Matawi · Branches"
      lede="Kila tawi lina stoo yake, simu zake na mauzo yake. Each branch holds its own stock, its own phones, and its own sales."
    >
      <Panel title={`Matawi · Branches (${branches.length})`}>
        {branches.length === 0 ? (
          <EmptyState
            title="Hakuna tawi bado · No branches yet"
            hint="Ongeza tawi lako la kwanza hapa chini."
          />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Tawi · Branch</th>
                  <th>Hali · Status</th>
                  <th>Limeanzishwa · Created</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <td>{branch.name}</td>
                    <td>
                      <span
                        className={
                          branch.isActive
                            ? 'shoprex-status shoprex-status--ok'
                            : 'shoprex-status shoprex-status--warn'
                        }
                      >
                        {branch.isActive ? 'Hai · Active' : 'Imesimamishwa'}
                      </span>
                    </td>
                    <td>{day(branch.createdAt)}</td>
                    <td>
                      <span className="shoprex-rowactions">
                        <Link
                          className="shoprex-linkbutton"
                          href={`/owner/sales?branch=${branch.id}`}
                        >
                          Mauzo · Sales
                        </Link>
                        <Link
                          className="shoprex-linkbutton"
                          href={`/owner/stock?branch=${branch.id}`}
                        >
                          Stoo · Stock
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Ongeza tawi · Add a branch">
        {isOwner(profile) ? (
          <BranchForm />
        ) : (
          <OwnerOnlyNote what="Kuongeza tawi · Adding a branch" />
        )}
      </Panel>
    </ConsoleShell>
  );
}

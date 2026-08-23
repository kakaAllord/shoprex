import { BranchPicker } from '../../../components/branch-picker';
import { ConsoleShell } from '../../../components/console-shell';
import { EmptyState, ErrorState, Panel } from '../../../components/states';
import { requireConsole } from '../../../lib/api/guard';
import { fetchMyBranches } from '../../../lib/api/organization';
import { describePackages, fetchBranchStock, needsRecount } from '../../../lib/api/stock';

export const dynamic = 'force-dynamic';

/**
 * What a branch holds, in packages.
 *
 * `5 Carton + 5 Piece`, never `35` and never `9.67 Cartons`. The normalized
 * figure the engine reckons in is deliberately not shown: doc 02 keeps
 * normalized mathematics away from the shop floor unless it explains an
 * operational outcome, and "what is on the shelf" is not one of those.
 *
 * A **negative balance is shown, counted, and named** rather than hidden. The
 * negative-stock policy exists to make a wrong count findable, and hiding it
 * on the one screen somebody would open to find it would defeat the policy.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { profile, token } = await requireConsole('owner');
  const { branch } = await searchParams;

  let branches;

  try {
    branches = await fetchMyBranches(token);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/stock" title="Stoo">
        <ErrorState error={error} retryHref="/owner/stock" />
      </ConsoleShell>
    );
  }

  if (branches.length === 0) {
    return (
      <ConsoleShell profile={profile} current="/owner/stock" title="Stoo · Stock">
        <EmptyState
          title="Huna tawi bado · No branch yet"
          hint="Stoo ni ya tawi, kwa hivyo ongeza tawi kwanza."
        />
      </ConsoleShell>
    );
  }

  const selected = branches.find((candidate) => candidate.id === branch) ?? branches[0];

  let stock;

  try {
    stock = await fetchBranchStock(token, selected.id);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/stock" title="Stoo · Stock">
        <BranchPicker branches={branches} selected={selected.id} basePath="/owner/stock" />
        <ErrorState error={error} retryHref={`/owner/stock?branch=${selected.id}`} />
      </ConsoleShell>
    );
  }

  const wrong = stock.filter(needsRecount);

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/stock"
      title="Stoo · Stock"
      lede={`Kilichopo ${selected.name}, katika vifurushi kama vilivyo rafuni. What ${selected.name} holds, in the packages it holds them in.`}
    >
      <BranchPicker branches={branches} selected={selected.id} basePath="/owner/stock" />

      {wrong.length > 0 ? (
        <p className="shoprex-state shoprex-state--denied" style={{ marginBottom: 16 }}>
          <strong>
            Bidhaa {wrong.length} zinahitaji kuhesabiwa upya · {wrong.length} item
            {wrong.length === 1 ? '' : 's'} need recounting.
          </strong>{' '}
          Idadi hasi maana yake kiliuzwa zaidi ya kilichoandikwa — si kosa la mfumo, ni
          hesabu iliyokosewa mahali fulani.
        </p>
      ) : null}

      <Panel title={`Stoo ya ${selected.name} · ${stock.length} bidhaa`}>
        {stock.length === 0 ? (
          <EmptyState
            title="Stoo ni tupu · Nothing on the shelf"
            hint="Pokea mzigo kwenye simu ili kuanza · Receive a delivery on the phone to start."
          />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Bidhaa · Product</th>
                  <th>Kilichopo · On the shelf</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((entry) => (
                  <tr
                    key={entry.productId}
                    className={needsRecount(entry) ? 'shoprex-warnrow' : undefined}
                  >
                    <td>
                      {entry.productName}
                      {needsRecount(entry) ? (
                        <span className="shoprex-sub">
                          Hesabu upya · Recount this one
                        </span>
                      ) : null}
                    </td>
                    <td>{describePackages(entry.packages)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </ConsoleShell>
  );
}

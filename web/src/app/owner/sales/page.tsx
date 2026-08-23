import Link from 'next/link';
import { BranchPicker } from '../../../components/branch-picker';
import { ConsoleShell } from '../../../components/console-shell';
import { EmptyState, ErrorState, Panel } from '../../../components/states';
import { money, moment } from '../../../lib/format';
import { requireConsole } from '../../../lib/api/guard';
import { fetchMyBranches } from '../../../lib/api/organization';
import { fetchSales } from '../../../lib/api/sales';

export const dynamic = 'force-dynamic';

/**
 * The sales list.
 *
 * Newest first, keyset-paged, and deliberately **without a date picker**.
 * Choosing a day and totalling it is Phase 7's dashboard, and doing local-day
 * arithmetic in two places is how the two come to disagree — this screen is
 * for finding a sale, not for reporting on a day.
 *
 * It needs `VIEW_REPORTS`. An owner always has it; a manager may not, and the
 * refusal is rendered as the shop's own rule rather than as a fault.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; cursor?: string }>;
}) {
  const { profile, token } = await requireConsole('owner');
  const { branch, cursor } = await searchParams;

  let branches;

  try {
    branches = await fetchMyBranches(token);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/sales" title="Mauzo">
        <ErrorState error={error} retryHref="/owner/sales" />
      </ConsoleShell>
    );
  }

  if (branches.length === 0) {
    return (
      <ConsoleShell profile={profile} current="/owner/sales" title="Mauzo · Sales">
        <EmptyState
          title="Huna tawi bado · No branch yet"
          hint="Mauzo ni ya tawi, kwa hivyo ongeza tawi kwanza."
        />
      </ConsoleShell>
    );
  }

  const selected = branches.find((candidate) => candidate.id === branch) ?? branches[0];

  let page;

  try {
    page = await fetchSales(token, selected.id, { limit: 50, cursor });
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/sales" title="Mauzo · Sales">
        <BranchPicker branches={branches} selected={selected.id} basePath="/owner/sales" />
        <ErrorState error={error} retryHref={`/owner/sales?branch=${selected.id}`} />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/sales"
      title="Mauzo · Sales"
      lede={`Mauzo ya ${selected.name}, mapya kwanza. Ripoti za siku na PDF zinakuja awamu ijayo. ${selected.name}'s sales, newest first — daily totals and PDFs arrive next phase.`}
    >
      <BranchPicker branches={branches} selected={selected.id} basePath="/owner/sales" />

      <Panel title={`Mauzo · Sales (${page.sales.length})`}>
        {page.sales.length === 0 ? (
          <EmptyState
            title={
              cursor
                ? 'Hakuna mauzo mengine · No more sales'
                : 'Hakuna mauzo bado · No sales yet'
            }
            hint="Mauzo yanaanza kwenye simu, kwenye skrini ya Mauzo."
          />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Wakati · When</th>
                  <th>Aliyeuza · Sold by</th>
                  <th className="shoprex-num">Vitu · Lines</th>
                  <th className="shoprex-num">Jumla · Total</th>
                  <th>Malipo · Paid by</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {page.sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className={sale.hasStockInconsistency ? 'shoprex-warnrow' : undefined}
                  >
                    <td>
                      {moment(sale.createdAt)}
                      {sale.hasStockInconsistency ? (
                        <span className="shoprex-sub">
                          Stoo ilikuwa pungufu · Stock was short
                        </span>
                      ) : null}
                    </td>
                    <td>{sale.soldByName}</td>
                    <td className="shoprex-num">{sale.lineCount}</td>
                    <td className="shoprex-num">
                      {money(sale.totalTzs)}
                      {sale.debtTzs > 0 ? (
                        <span className="shoprex-sub">
                          Deni · Owed {money(sale.debtTzs)}
                        </span>
                      ) : null}
                    </td>
                    <td>{sale.paymentMethods.join(' + ')}</td>
                    <td>
                      <Link
                        className="shoprex-linkbutton"
                        href={`/owner/sales/${selected.id}/${sale.id}`}
                      >
                        Risiti · Receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="shoprex-pager">
          {cursor ? (
            <Link className="shoprex-linkbutton" href={`/owner/sales?branch=${selected.id}`}>
              ← Mwanzo · Back to the top
            </Link>
          ) : (
            <span />
          )}

          {page.nextCursor ? (
            <Link
              className="shoprex-linkbutton"
              href={`/owner/sales?branch=${selected.id}&cursor=${page.nextCursor}`}
            >
              Mauzo ya zamani zaidi · Older sales →
            </Link>
          ) : (
            <span className="shoprex-note" style={{ margin: 0 }}>
              Mwisho wa orodha · End of the list
            </span>
          )}
        </div>
      </Panel>
    </ConsoleShell>
  );
}

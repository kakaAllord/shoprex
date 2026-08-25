import Link from 'next/link';
import { BranchPicker } from '../../../components/branch-picker';
import { ConsoleShell } from '../../../components/console-shell';
import { EmptyState, ErrorState, Panel } from '../../../components/states';
import { day, money, moment } from '../../../lib/format';
import { requireConsole } from '../../../lib/api/guard';
import { fetchMyBranches } from '../../../lib/api/organization';
import {
  BranchComparison,
  DailyReport,
  fetchBranchComparison,
  fetchDailyReport,
} from '../../../lib/api/reports';

export const dynamic = 'force-dynamic';

/**
 * The day, read back.
 *
 * Everything an owner asks of a day: what was sold, how it was paid, what is
 * owed and against whose name, who sold it, what arrived on the shelf, and —
 * for a shop with more than one branch — how they compare. The PDF downloads
 * the very same numbers this screen shows, because both are rendered from one
 * backend response (`src/modules/reports/reports.service.ts`).
 *
 * **The day is the shop's, not the browser's.** `window` on the response names
 * the exact UTC instants counted, in the shop's own zone — this screen only
 * displays what the backend decided, never a date the browser computed.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; date?: string }>;
}) {
  const { profile, token } = await requireConsole('owner');
  const { branch, date } = await searchParams;

  let branches;

  try {
    branches = await fetchMyBranches(token);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/reports" title="Ripoti">
        <ErrorState error={error} retryHref="/owner/reports" />
      </ConsoleShell>
    );
  }

  if (branches.length === 0) {
    return (
      <ConsoleShell profile={profile} current="/owner/reports" title="Ripoti · Reports">
        <EmptyState
          title="Huna tawi bado · No branch yet"
          hint="Ripoti ni ya tawi, kwa hivyo ongeza tawi kwanza."
        />
      </ConsoleShell>
    );
  }

  const selected = branches.find((candidate) => candidate.id === branch) ?? branches[0];

  let report: DailyReport;

  try {
    report = await fetchDailyReport(token, selected.id, date);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/reports" title="Ripoti · Reports">
        <BranchPicker branches={branches} selected={selected.id} basePath="/owner/reports" />
        <ErrorState
          error={error}
          retryHref={`/owner/reports?branch=${selected.id}${date ? `&date=${date}` : ''}`}
        />
      </ConsoleShell>
    );
  }

  let comparison: BranchComparison | null = null;

  if (branches.length > 1) {
    try {
      comparison = await fetchBranchComparison(token, report.window.date);
    } catch {
      // The single-branch report above already loaded; a comparison that
      // fails to load costs the owner a section, not the whole page.
      comparison = null;
    }
  }

  const todayQuery = `/owner/reports?branch=${selected.id}`;
  const branchQuery = (branchId: string) =>
    `/owner/reports?branch=${branchId}${date ? `&date=${date}` : ''}`;
  const pdfHref = `/api/reports/pdf?branchId=${selected.id}${date ? `&date=${date}` : ''}`;

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/reports"
      title="Ripoti · Reports"
      lede={`Ripoti ya ${day(report.window.date + 'T12:00:00Z')} kwa ${selected.name}. Daily totals for ${selected.name}, in the shop's own day.`}
    >
      {branches.length > 1 ? (
        <div className="shoprex-branchbar" role="navigation" aria-label="Tawi · Branch">
          {branches.map((candidate) => (
            <Link
              key={candidate.id}
              href={branchQuery(candidate.id)}
              className={
                candidate.id === selected.id
                  ? 'shoprex-branchbar__link shoprex-branchbar__link--on'
                  : 'shoprex-branchbar__link'
              }
              aria-current={candidate.id === selected.id ? 'page' : undefined}
            >
              {candidate.name}
            </Link>
          ))}
        </div>
      ) : null}

      <Panel title="Chagua siku · Select a date">
        <form className="shoprex-inlineform" method="get" action="/owner/reports">
          <input type="hidden" name="branch" value={selected.id} />
          <input
            className="shoprex-input"
            type="date"
            name="date"
            defaultValue={report.window.date}
            aria-label="Tarehe · Date"
          />
          <button className="shoprex-button" type="submit">
            Tazama · View
          </button>
          {date ? (
            <Link className="shoprex-linkbutton" href={todayQuery}>
              Leo · Today
            </Link>
          ) : null}
          <a className="shoprex-linkbutton" href={pdfHref}>
            Pakua PDF · Download PDF
          </a>
        </form>
        <p className="shoprex-note" style={{ margin: 0 }}>
          Siku ya duka {report.window.startUtc} → {report.window.endUtc} ({report.window.timezone})
          · Shop day, in server time.
        </p>
      </Panel>

      <div className="shoprex-metrics">
        <div className="shoprex-metric">
          <div className="shoprex-metric__value">{money(report.totals.collectedTzs)}</div>
          <div className="shoprex-metric__label">Zilizoingia · Collected</div>
        </div>
        <div className="shoprex-metric">
          <div className="shoprex-metric__value">{report.totals.saleCount}</div>
          <div className="shoprex-metric__label">Mauzo · Sales</div>
        </div>
        <div className="shoprex-metric">
          <div className="shoprex-metric__value">{money(report.totals.debtTzs)}</div>
          <div className="shoprex-metric__label">Deni · Owed</div>
        </div>
        <div className="shoprex-metric">
          <div className="shoprex-metric__value">{money(report.totals.salesTotalTzs)}</div>
          <div className="shoprex-metric__label">Jumla ya mauzo · Total sold</div>
        </div>
      </div>

      {report.totals.salesWithShortfall > 0 ? (
        <div className="shoprex-alert" role="alert">
          Mauzo {report.totals.salesWithShortfall} yalizidi stoo iliyorekodiwa — hesabu upya · {' '}
          {report.totals.salesWithShortfall} sale(s) sold more than the records held; recount Stoo.
        </div>
      ) : null}

      <Panel title="Malipo · Payments">
        {report.paymentBreakdown.length === 0 ? (
          <EmptyState title="Hakuna malipo siku hii · No payments this day" />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Njia · Method</th>
                  <th className="shoprex-num">Mauzo · Sales</th>
                  <th className="shoprex-num">Kiasi · Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.paymentBreakdown.map((row) => (
                  <tr key={row.paymentMethodId}>
                    <td>{row.methodName}</td>
                    <td className="shoprex-num">{row.saleCount}</td>
                    <td className="shoprex-num">{money(row.amountTzs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Deni · Debts">
        {report.debts.length === 0 ? (
          <EmptyState title="Hakuna deni siku hii · No debt recorded this day" />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Mdaiwa · Debtor</th>
                  <th className="shoprex-num">Mauzo · Sales</th>
                  <th className="shoprex-num">Kiasi · Owed</th>
                </tr>
              </thead>
              <tbody>
                {report.debts.map((row) => (
                  <tr key={row.debtorName}>
                    <td>{row.debtorName}</td>
                    <td className="shoprex-num">{row.saleCount}</td>
                    <td className="shoprex-num">{money(row.amountTzs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Wafanyakazi · Who sold">
        {report.sellers.length === 0 ? (
          <EmptyState title="Hakuna mauzo siku hii · No sales this day" />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Jina · Name</th>
                  <th className="shoprex-num">Mauzo · Sales</th>
                  <th className="shoprex-num">Jumla · Total</th>
                  <th className="shoprex-num">Deni · Owed</th>
                </tr>
              </thead>
              <tbody>
                {report.sellers.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.name}</td>
                    <td className="shoprex-num">{row.saleCount}</td>
                    <td className="shoprex-num">{money(row.salesTotalTzs)}</td>
                    <td className="shoprex-num">{money(row.debtTzs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Bidhaa zilizouzwa zaidi · Best sellers">
        {report.topProducts.length === 0 ? (
          <EmptyState title="Hakuna mauzo siku hii · No sales this day" />
        ) : (
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Bidhaa · Product</th>
                  <th className="shoprex-num">Idadi · Quantity</th>
                  <th className="shoprex-num">Jumla · Total</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.map((row) => (
                  <tr key={`${row.productId}-${row.unitName}`}>
                    <td>
                      {row.productName} <span className="shoprex-sub">{row.unitName}</span>
                    </td>
                    <td className="shoprex-num">{row.quantity}</td>
                    <td className="shoprex-num">{money(row.totalTzs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Mzigo uliopokelewa · Stock received">
        {report.received.rows.length === 0 ? (
          <EmptyState title="Hakuna mzigo siku hii · No delivery recorded this day" />
        ) : (
          <>
            <div className="shoprex-tablewrap">
              <table className="shoprex-table">
                <thead>
                  <tr>
                    <th>Bidhaa · Product</th>
                    <th className="shoprex-num">Idadi · Quantity</th>
                    <th className="shoprex-num">Gharama · Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.received.rows.map((row) => (
                    <tr key={`${row.productId}-${row.productUnitId}`}>
                      <td>
                        {row.productName} <span className="shoprex-sub">{row.unitName}</span>
                      </td>
                      <td className="shoprex-num">{row.quantity}</td>
                      <td className="shoprex-num">
                        {row.costTzs === null ? '—' : money(row.costTzs)}
                        {row.costIsPartial ? <span className="shoprex-sub">sehemu · partial</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.received.totalCostTzs === null ? (
              <p className="shoprex-note">Gharama haikurekodiwa · No cost was recorded</p>
            ) : (
              <p className="shoprex-note">
                Jumla ya gharama · Total cost {money(report.received.totalCostTzs)}
                {report.received.costIsPartial ? ' (sehemu · some lines had none)' : ''}
              </p>
            )}
          </>
        )}
      </Panel>

      {comparison ? (
        <Panel title="Kulinganisha matawi · Branch comparison">
          <div className="shoprex-tablewrap">
            <table className="shoprex-table">
              <thead>
                <tr>
                  <th>Tawi · Branch</th>
                  <th className="shoprex-num">Mauzo · Sales</th>
                  <th className="shoprex-num">Jumla · Total</th>
                  <th className="shoprex-num">Deni · Owed</th>
                  <th className="shoprex-num">Zilizoingia · Collected</th>
                </tr>
              </thead>
              <tbody>
                {comparison.branches.map((row) => (
                  <tr key={row.branchId}>
                    <td>
                      <Link className="shoprex-linkbutton" href={branchQuery(row.branchId)}>
                        {row.branchName}
                      </Link>
                    </td>
                    <td className="shoprex-num">{row.saleCount}</td>
                    <td className="shoprex-num">{money(row.salesTotalTzs)}</td>
                    <td className="shoprex-num">{money(row.debtTzs)}</td>
                    <td className="shoprex-num">{money(row.collectedTzs)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Jumla · Total</td>
                  <td className="shoprex-num">{comparison.totals.saleCount}</td>
                  <td className="shoprex-num">{money(comparison.totals.salesTotalTzs)}</td>
                  <td className="shoprex-num">{money(comparison.totals.debtTzs)}</td>
                  <td className="shoprex-num">{money(comparison.totals.collectedTzs)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel title={`Mauzo moja moja · Transactions (${report.transactions.length})`}>
        {report.transactions.length === 0 ? (
          <EmptyState title="Hakuna mauzo siku hii · No sales this day" />
        ) : (
          <>
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
                  {report.transactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className={transaction.hasStockInconsistency ? 'shoprex-warnrow' : undefined}
                    >
                      <td>{moment(transaction.createdAt)}</td>
                      <td>{transaction.soldByName}</td>
                      <td className="shoprex-num">{transaction.lineCount}</td>
                      <td className="shoprex-num">{money(transaction.totalTzs)}</td>
                      <td>{transaction.paymentMethods.join(' + ')}</td>
                      <td>
                        <Link
                          className="shoprex-linkbutton"
                          href={`/owner/sales/${selected.id}/${transaction.id}`}
                        >
                          Risiti · Receipt
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.transactionsTruncated ? (
              <p className="shoprex-note">
                Orodha imekatwa baada ya {report.transactions.length} · List cut after{' '}
                {report.transactions.length} — the totals above cover the whole day. Tumia{' '}
                <Link className="shoprex-linkbutton" href={`/owner/sales?branch=${selected.id}&date=${report.window.date}`}>
                  Mauzo
                </Link>{' '}
                kwa orodha kamili · use Mauzo for the full paged list.
              </p>
            ) : null}
          </>
        )}
      </Panel>
    </ConsoleShell>
  );
}

import Link from 'next/link';
import { DownloadIcon, TriangleAlertIcon } from 'lucide-react';
import { BranchPicker } from '@/components/branch-picker';
import { ConsoleShell } from '@/components/console-shell';
import { EmptyState, ErrorState, Panel } from '@/components/states';
import { StatCard } from '@/components/stat-card';
import { BarList, type BarRow } from '@/components/charts/bar-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { day, money, moment } from '@/lib/format';
import { requireConsole } from '@/lib/api/guard';
import { fetchMyBranches } from '@/lib/api/organization';
import {
  BranchComparison,
  DailyReport,
  fetchBranchComparison,
  fetchDailyReport,
} from '@/lib/api/reports';

export const dynamic = 'force-dynamic';

/**
 * Which chart colour a payment method gets, decided by what kind of money it
 * is rather than by what order it happens to come back in.
 *
 * Cash is the green one because cash is money already in the drawer; debt is
 * amber because it is money that is not. A shop renaming "Deni" to something
 * else does not move it, and a shop that adds a fourth method does not repaint
 * the other three — colour follows the entity, never its rank.
 */
const SERIES_BY_KIND: Record<string, BarRow['series']> = {
  CASH: 1,
  MOBILE_MONEY: 2,
  DEBT: 3,
  OTHER: 4,
  BANK: 5,
};

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
 *
 * The figures come first and the tables after, which is the one ordering
 * change this screen has had: an owner opens Ripoti to find out what the day
 * took, and used to have to scroll past a date picker to see it.
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
        <BranchPicker
          branches={branches}
          selected={selected.id}
          basePath="/owner/reports"
          query={{ date }}
        />
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
      title="Ripoti"
      lede={`${day(report.window.date + 'T12:00:00Z')} · ${selected.name}`}
      actions={
        <Button asChild size="sm">
          <a href={pdfHref}>
            <DownloadIcon />
            Pakua PDF
          </a>
        </Button>
      }
    >
      {/* The money first. Everything below explains it. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Zilizoingia · Collected"
          value={money(report.totals.collectedTzs)}
          tone="money"
          hint={`Chenji iliyotolewa · change given ${money(report.totals.changeTzs)}`}
        />
        <StatCard
          label="Mauzo · Sales"
          value={report.totals.saleCount}
          hint={`Vitu ${report.totals.lineCount} · lines sold`}
        />
        <StatCard
          label="Deni · Owed"
          value={money(report.totals.debtTzs)}
          tone={report.totals.debtTzs > 0 ? 'owed' : 'default'}
          hint={
            report.debts.length > 0
              ? `Watu ${report.debts.length} · debtors`
              : 'Hakuna deni · nobody owes'
          }
        />
        <StatCard
          label="Jumla ya mauzo · Total sold"
          value={money(report.totals.salesTotalTzs)}
          hint="Zilizoingia + deni"
        />
      </div>

      {report.totals.salesWithShortfall > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <div className="flex flex-1 flex-col items-start gap-2">
            <AlertTitle>
              Mauzo {report.totals.salesWithShortfall} yalizidi stoo iliyorekodiwa — hesabu upya
            </AlertTitle>
            <AlertDescription>
              {report.totals.salesWithShortfall} sale(s) sold more than the records held. Mauzo
              yalikamilika; hesabu ndiyo yenye shaka.
            </AlertDescription>
            <Button asChild variant="outline" size="sm">
              <Link href={`/owner/stock?branch=${selected.id}`}>Fungua Stoo · Open stock</Link>
            </Button>
          </div>
        </Alert>
      ) : null}

      {/* Choosing a different day, and a different branch. */}
      <div className="flex flex-wrap items-end gap-3">
        <BranchPicker
          branches={branches}
          selected={selected.id}
          basePath="/owner/reports"
          query={{ date }}
        />

        <form method="get" action="/owner/reports" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="branch" value={selected.id} />
          <Input
            type="date"
            name="date"
            defaultValue={report.window.date}
            aria-label="Tarehe · Date"
            className="w-auto"
          />
          <Button type="submit" variant="outline" size="sm">
            Tazama · View
          </Button>
          {date ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={todayQuery}>Leo · Today</Link>
            </Button>
          ) : null}
        </form>
      </div>

      <p className="text-xs text-muted-foreground">
        Siku ya duka {report.window.startUtc} → {report.window.endUtc} ({report.window.timezone}) ·
        Shop day, in server time.
      </p>

      {/* The two questions a day gets asked most, side by side. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Malipo · Payments" description="How the day was paid">
          {report.paymentBreakdown.length === 0 ? (
            <EmptyState title="Hakuna malipo siku hii · No payments this day" />
          ) : (
            <BarList
              rows={report.paymentBreakdown.map((row) => ({
                label: row.methodName,
                sublabel: `mauzo ${row.saleCount}`,
                value: row.amountTzs,
                display: money(row.amountTzs),
                series: SERIES_BY_KIND[row.methodKind] ?? 4,
              }))}
            />
          )}
        </Panel>

        <Panel title="Bidhaa zilizouzwa zaidi · Best sellers" description="By takings, not by count">
          {report.topProducts.length === 0 ? (
            <EmptyState title="Hakuna mauzo siku hii · No sales this day" />
          ) : (
            <BarList
              rows={report.topProducts.map((row) => ({
                label: row.productName,
                sublabel: `${row.unitName} · ${row.quantity}`,
                value: row.totalTzs,
                display: money(row.totalTzs),
                series: 2,
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Wafanyakazi · Who sold">
          {report.sellers.length === 0 ? (
            <EmptyState title="Hakuna mauzo siku hii · No sales this day" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jina · Name</TableHead>
                  <TableHead className="text-right">Mauzo</TableHead>
                  <TableHead className="text-right">Jumla</TableHead>
                  <TableHead className="text-right">Deni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.sellers.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">{row.saleCount}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {money(row.salesTotalTzs)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right text-warning-foreground">
                      {row.debtTzs === 0 ? '—' : money(row.debtTzs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel title="Deni · Debts" description="Jina lililoandikwa wakati wa mauzo">
          {report.debts.length === 0 ? (
            <EmptyState title="Hakuna deni siku hii · No debt recorded this day" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mdaiwa · Debtor</TableHead>
                  <TableHead className="text-right">Mauzo</TableHead>
                  <TableHead className="text-right">Kiasi · Owed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.debts.map((row) => (
                  <TableRow key={row.debtorName}>
                    <TableCell className="font-medium">{row.debtorName}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">{row.saleCount}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold text-warning-foreground">
                      {money(row.amountTzs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      <Panel
        title="Mzigo uliopokelewa · Stock received"
        description={
          report.received.totalCostTzs === null
            ? 'Gharama haikurekodiwa · no cost was recorded'
            : `Jumla ya gharama · total cost ${money(report.received.totalCostTzs)}${
                report.received.costIsPartial ? ' (sehemu · some lines had none)' : ''
              }`
        }
      >
        {report.received.rows.length === 0 ? (
          <EmptyState title="Hakuna mzigo siku hii · No delivery recorded this day" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bidhaa · Product</TableHead>
                <TableHead className="text-right">Idadi · Quantity</TableHead>
                <TableHead className="text-right">Gharama · Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.received.rows.map((row) => (
                <TableRow key={`${row.productId}-${row.productUnitId}`}>
                  <TableCell>
                    <span className="font-medium">{row.productName}</span>{' '}
                    <span className="text-xs text-muted-foreground">{row.unitName}</span>
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">{row.quantity}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">
                    {row.costTzs === null ? '—' : money(row.costTzs)}
                    {row.costIsPartial ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">sehemu</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {comparison ? (
        <Panel title="Kulinganisha matawi · Branch comparison" description={day(report.window.date + 'T12:00:00Z')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tawi · Branch</TableHead>
                <TableHead className="text-right">Mauzo</TableHead>
                <TableHead className="text-right">Jumla</TableHead>
                <TableHead className="text-right">Deni</TableHead>
                <TableHead className="text-right">Zilizoingia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.branches.map((row) => (
                <TableRow key={row.branchId}>
                  <TableCell>
                    <Link
                      href={branchQuery(row.branchId)}
                      className="font-medium text-info underline-offset-4 hover:underline"
                    >
                      {row.branchName}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">{row.saleCount}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">{money(row.salesTotalTzs)}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">{money(row.debtTzs)}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-medium">
                    {money(row.collectedTzs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Jumla · Total</TableCell>
                <TableCell className="tabular whitespace-nowrap text-right">{comparison.totals.saleCount}</TableCell>
                <TableCell className="tabular whitespace-nowrap text-right">
                  {money(comparison.totals.salesTotalTzs)}
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-right">
                  {money(comparison.totals.debtTzs)}
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                  {money(comparison.totals.collectedTzs)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Panel>
      ) : null}

      <Panel title={`Mauzo moja moja · Transactions (${report.transactions.length})`}>
        {report.transactions.length === 0 ? (
          <EmptyState title="Hakuna mauzo siku hii · No sales this day" />
        ) : (
          <div className="flex flex-col gap-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wakati · When</TableHead>
                  <TableHead>Aliyeuza · Sold by</TableHead>
                  <TableHead className="text-right">Vitu</TableHead>
                  <TableHead className="text-right">Jumla</TableHead>
                  <TableHead>Malipo · Paid by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {moment(transaction.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {transaction.soldByName}
                        {transaction.hasStockInconsistency ? (
                          <Badge variant="warning">
                            <TriangleAlertIcon />
                            hesabu
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">{transaction.lineCount}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {money(transaction.totalTzs)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {transaction.paymentMethods.join(' + ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/owner/sales/${selected.id}/${transaction.id}`}>Risiti</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {report.transactionsTruncated ? (
              <p className="text-xs text-muted-foreground">
                Orodha imekatwa baada ya {report.transactions.length} · List cut after{' '}
                {report.transactions.length} — the totals above cover the whole day. Tumia{' '}
                <Link
                  href={`/owner/sales?branch=${selected.id}&date=${report.window.date}`}
                  className="font-medium text-info underline-offset-4 hover:underline"
                >
                  Mauzo
                </Link>{' '}
                kwa orodha kamili.
              </p>
            ) : null}
          </div>
        )}
      </Panel>
    </ConsoleShell>
  );
}

import Link from 'next/link';
import { ArrowLeftIcon, ArrowRightIcon, TriangleAlertIcon } from 'lucide-react';
import { BranchPicker } from '@/components/branch-picker';
import { ConsoleShell } from '@/components/console-shell';
import { EmptyState, ErrorState, Panel } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { money, moment } from '@/lib/format';
import { requireConsole } from '@/lib/api/guard';
import { fetchMyBranches } from '@/lib/api/organization';
import { fetchSales } from '@/lib/api/sales';

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
      title="Mauzo"
      lede={`${selected.name}, mapya kwanza · newest first. Kwa jumla ya siku na PDF, angalia Ripoti.`}
      actions={
        <BranchPicker branches={branches} selected={selected.id} basePath="/owner/sales" />
      }
    >
      <Panel title={`Mauzo · Sales (${page.sales.length})`}>
        {page.sales.length === 0 ? (
          <EmptyState
            title={
              cursor ? 'Hakuna mauzo mengine · No more sales' : 'Hakuna mauzo bado · No sales yet'
            }
            hint="Mauzo yanaanza kwenye simu, kwenye skrini ya Mauzo."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wakati · When</TableHead>
                <TableHead>Aliyeuza · Sold by</TableHead>
                <TableHead className="text-right">Vitu</TableHead>
                <TableHead className="text-right">Jumla · Total</TableHead>
                <TableHead>Malipo · Paid by</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {moment(sale.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {sale.soldByName}
                      {sale.hasStockInconsistency ? (
                        <Badge variant="warning" title="Stoo ilikuwa pungufu · Stock was short">
                          <TriangleAlertIcon />
                          hesabu
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right">{sale.lineCount}</TableCell>
                  <TableCell className="tabular text-right">
                    <span className="font-medium">{money(sale.totalTzs)}</span>
                    {sale.debtTzs > 0 ? (
                      <span className="block text-xs text-warning-foreground">
                        deni {money(sale.debtTzs)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sale.paymentMethods.join(' + ')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/owner/sales/${selected.id}/${sale.id}`}>Risiti</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
          {cursor ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/owner/sales?branch=${selected.id}`}>
                <ArrowLeftIcon />
                Mwanzo · Back to the top
              </Link>
            </Button>
          ) : (
            <span />
          )}

          {page.nextCursor ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/owner/sales?branch=${selected.id}&cursor=${page.nextCursor}`}>
                Ya zamani zaidi · Older
                <ArrowRightIcon />
              </Link>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Mwisho wa orodha · End of the list</span>
          )}
        </div>
      </Panel>
    </ConsoleShell>
  );
}

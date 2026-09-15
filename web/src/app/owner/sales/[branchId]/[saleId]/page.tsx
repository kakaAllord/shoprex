import Link from 'next/link';
import { ArrowLeftIcon, TriangleAlertIcon } from 'lucide-react';
import { ConsoleShell } from '@/components/console-shell';
import { ErrorState, Panel } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { fetchSale } from '@/lib/api/sales';

export const dynamic = 'force-dynamic';

/**
 * One sale, as the customer was shown it.
 *
 * Every line reads from its own snapshot — the product name, the unit name,
 * the price, and the conversion factor as they were when it was rung up — so
 * this page says the same thing next month as it did on the day, whatever has
 * been repriced or renamed since.
 */
export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ branchId: string; saleId: string }>;
}) {
  const { profile, token } = await requireConsole('owner');
  const { branchId, saleId } = await params;

  const backLink = (
    <Button asChild variant="ghost" size="sm">
      <Link href={`/owner/sales?branch=${branchId}`}>
        <ArrowLeftIcon />
        Mauzo · Back to sales
      </Link>
    </Button>
  );

  let sale;

  try {
    sale = await fetchSale(token, branchId, saleId);
  } catch (error) {
    return (
      <ConsoleShell
        profile={profile}
        current="/owner/sales"
        title="Risiti · Receipt"
        actions={backLink}
      >
        <ErrorState error={error} />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/sales"
      title="Risiti"
      lede={`${moment(sale.createdAt)} · ${sale.soldByName}`}
      actions={backLink}
    >
      {sale.hasStockInconsistency ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <div className="flex flex-col gap-1">
            <AlertTitle>Stoo ilikuwa pungufu · The count was short</AlertTitle>
            <AlertDescription>
              Mauzo yalikamilika — mtu alikuwa ameshika bidhaa, kwa hivyo duka lilikuwa nayo.
              Kilichokosekana kimeandikwa hapa chini ili uhesabu upya.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      <Panel
        title="Vilivyouzwa · What was sold"
        description="Bei hizi ni za siku ile — kubadilisha bei leo hakubadilishi risiti hii."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bidhaa · Product</TableHead>
              <TableHead>Kipimo · Unit</TableHead>
              <TableHead className="text-right">Idadi · Qty</TableHead>
              <TableHead className="text-right">Bei · Unit price</TableHead>
              <TableHead className="text-right">Jumla · Line</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sale.lines.map((line, index) => (
              <TableRow key={`${line.productUnitId}-${index}`}>
                <TableCell className="font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {line.productName}
                    {line.shortfallNormalized > 0 ? (
                      <Badge variant="warning">
                        <TriangleAlertIcon />
                        pungufu {line.shortfallNormalized}
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{line.unitName}</TableCell>
                <TableCell className="tabular text-right">{line.quantity}</TableCell>
                <TableCell className="tabular text-right">{money(line.unitPriceTzs)}</TableCell>
                <TableCell className="tabular text-right font-medium">
                  {money(line.lineTotalTzs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Malipo · How it was settled">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Njia · Method</TableHead>
              <TableHead className="text-right">Kiasi · Amount</TableHead>
              <TableHead className="text-right">Alitoa · Tendered</TableHead>
              <TableHead className="text-right">Chenji · Change</TableHead>
              <TableHead>Deni la · Owed by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sale.payments.map((payment) => (
              <TableRow key={payment.paymentMethodId}>
                <TableCell className="font-medium">{payment.methodName}</TableCell>
                <TableCell className="tabular text-right">{money(payment.amountTzs)}</TableCell>
                <TableCell className="tabular text-right">
                  {payment.cashReceivedTzs === null ? '—' : money(payment.cashReceivedTzs)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {payment.changeTzs === null ? '—' : money(payment.changeTzs)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {payment.debtorName ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t pt-4 text-sm">
          <dt className="text-muted-foreground">Jumla · Total</dt>
          <dd className="tabular text-right font-semibold">{money(sale.totalTzs)}</dd>
          <dt className="text-muted-foreground">Chenji · Change given</dt>
          <dd className="tabular text-right">{money(sale.changeTzs)}</dd>
          <dt className="text-muted-foreground">Deni · Recorded as owed</dt>
          <dd className="tabular text-right">{money(sale.debtTzs)}</dd>
          <dt className="text-muted-foreground">Simu · Phone</dt>
          <dd className="text-right">
            {sale.deviceId ?? 'Haikuuzwa kwenye simu · Not sold on a phone'}
          </dd>
        </dl>
      </Panel>
    </ConsoleShell>
  );
}

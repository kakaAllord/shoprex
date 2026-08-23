import Link from 'next/link';
import { ConsoleShell } from '../../../../../components/console-shell';
import { ErrorState, Panel } from '../../../../../components/states';
import { money, moment } from '../../../../../lib/format';
import { requireConsole } from '../../../../../lib/api/guard';
import { fetchSale } from '../../../../../lib/api/sales';

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

  let sale;

  try {
    sale = await fetchSale(token, branchId, saleId);
  } catch (error) {
    return (
      <ConsoleShell profile={profile} current="/owner/sales" title="Risiti · Receipt">
        <Link className="shoprex-backlink" href={`/owner/sales?branch=${branchId}`}>
          ← Mauzo · Back to sales
        </Link>
        <ErrorState error={error} />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/sales"
      title="Risiti · Receipt"
      lede={`${moment(sale.createdAt)} · ${sale.soldByName}`}
    >
      <Link className="shoprex-backlink" href={`/owner/sales?branch=${branchId}`}>
        ← Mauzo · Back to sales
      </Link>

      {sale.hasStockInconsistency ? (
        <p className="shoprex-state shoprex-state--denied" style={{ marginBottom: 16 }}>
          <strong>Stoo ilikuwa pungufu · The count was short.</strong> Mauzo yalikamilika —
          mtu alikuwa ameshika bidhaa, kwa hivyo duka lilikuwa nayo. Kilichokosekana
          kimeandikwa hapa chini ili uhesabu upya. The sale completed; what the records
          could not cover is recorded below so it can be recounted.
        </p>
      ) : null}

      <Panel title="Vilivyouzwa · What was sold">
        <div className="shoprex-tablewrap">
          <table className="shoprex-table">
            <thead>
              <tr>
                <th>Bidhaa · Product</th>
                <th>Kipimo · Unit</th>
                <th className="shoprex-num">Idadi · Qty</th>
                <th className="shoprex-num">Bei · Unit price</th>
                <th className="shoprex-num">Jumla · Line</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((line, index) => (
                <tr
                  key={`${line.productUnitId}-${index}`}
                  className={line.shortfallNormalized > 0 ? 'shoprex-warnrow' : undefined}
                >
                  <td>
                    {line.productName}
                    {line.shortfallNormalized > 0 ? (
                      <span className="shoprex-sub">
                        Pungufu · Short by {line.shortfallNormalized}
                      </span>
                    ) : null}
                  </td>
                  <td>{line.unitName}</td>
                  <td className="shoprex-num">{line.quantity}</td>
                  <td className="shoprex-num">{money(line.unitPriceTzs)}</td>
                  <td className="shoprex-num">{money(line.lineTotalTzs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="shoprex-note">
          Bei hizi ni za siku ile. Kubadilisha bei leo hakubadilishi risiti hii. These are
          the prices of the day — repricing today never rewrites this receipt.
        </p>
      </Panel>

      <Panel title="Malipo · How it was settled">
        <div className="shoprex-tablewrap">
          <table className="shoprex-table">
            <thead>
              <tr>
                <th>Njia · Method</th>
                <th className="shoprex-num">Kiasi · Amount</th>
                <th className="shoprex-num">Alitoa · Tendered</th>
                <th className="shoprex-num">Chenji · Change</th>
                <th>Deni la · Owed by</th>
              </tr>
            </thead>
            <tbody>
              {sale.payments.map((payment) => (
                <tr key={payment.paymentMethodId}>
                  <td>{payment.methodName}</td>
                  <td className="shoprex-num">{money(payment.amountTzs)}</td>
                  <td className="shoprex-num">
                    {payment.cashReceivedTzs === null ? '—' : money(payment.cashReceivedTzs)}
                  </td>
                  <td className="shoprex-num">
                    {payment.changeTzs === null ? '—' : money(payment.changeTzs)}
                  </td>
                  <td>{payment.debtorName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="shoprex-kv" style={{ marginTop: 16 }}>
          <dt>Jumla · Total</dt>
          <dd>{money(sale.totalTzs)}</dd>
          <dt>Chenji · Change given</dt>
          <dd>{money(sale.changeTzs)}</dd>
          <dt>Deni · Recorded as owed</dt>
          <dd>{money(sale.debtTzs)}</dd>
          <dt>Simu · Phone</dt>
          <dd>{sale.deviceId ?? 'Haikuuzwa kwenye simu · Not sold on a phone'}</dd>
        </dl>
      </Panel>
    </ConsoleShell>
  );
}

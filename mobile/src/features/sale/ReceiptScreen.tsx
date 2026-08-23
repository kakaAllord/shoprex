import { Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../app/theme';
import { Banner, Card, PrimaryButton, SecondaryButton } from '../../app/ui';
import { Sale } from '../../core/api/apiClient';
import { formatTzs } from '../../domain/cart';

/**
 * The receipt, and the way straight back into the next sale.
 *
 * It shows the **commercial units actually sold** — `2 Cartons`, `5 Pieces` —
 * never the normalized arithmetic underneath, which is the engine's business
 * and not the customer's. Every number here came back from the backend, so
 * what is on screen is what was stored.
 *
 * "Mauzo mapya" is the biggest button on purpose: doc 01 §7 says the receipt
 * can be viewed, shared, or skipped so the seller can start again, and in a
 * busy shop skipping is the common case.
 */
export function ReceiptScreen({
  sale,
  onNewSale,
  onHome,
}: {
  sale: Sale;
  onNewSale: () => void;
  onHome: () => void;
}) {
  const share = () => {
    void Share.share({ message: receiptText(sale) });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Banner testID="receipt-done" tone="success" title="Mauzo yamekamilika · Sale completed" />

      {sale.hasStockInconsistency ? (
        <Banner
          testID="receipt-stock-note"
          tone="warning"
          title="Hesabu ya stoo haikulingana · Stock count did not match"
        >
          <Text style={styles.mutedText}>
            Mauzo yamekamilika kama kawaida. Idadi iliyoandikwa ilikuwa pungufu, hivyo
            mmiliki ataona taarifa ya kuhesabu upya · The sale went through normally.
            The recorded count was short, so the owner has been notified to recount.
          </Text>
        </Banner>
      ) : null}

      <Text testID="receipt-total" style={styles.total}>
        {formatTzs(sale.totalTzs)}
      </Text>
      <Text style={styles.mutedText}>
        {new Date(sale.createdAt).toLocaleString()} · {sale.soldByName}
      </Text>

      <Card style={styles.spaced}>
        {sale.lines.map((line, index) => (
          <View key={`${line.productName}-${line.unitName}-${index}`} style={styles.line}>
            <View style={styles.lineNames}>
              <Text style={styles.lineName}>{line.productName}</Text>
              <Text style={styles.lineDetail}>
                {line.quantity} × {line.unitName} @ {formatTzs(line.unitPriceTzs)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>{formatTzs(line.lineTotalTzs)}</Text>
          </View>
        ))}
      </Card>

      <Card>
        {sale.payments.map((payment, index) => (
          <View key={`${payment.methodName}-${index}`} style={styles.line}>
            <View style={styles.lineNames}>
              <Text style={styles.lineName}>{payment.methodName}</Text>
              {payment.debtorName ? (
                <Text style={styles.lineDetail}>Mdaiwa · Debtor: {payment.debtorName}</Text>
              ) : null}
              {payment.cashReceivedTzs !== null ? (
                <Text style={styles.lineDetail}>
                  Alitoa · Given {formatTzs(payment.cashReceivedTzs)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.lineTotal}>{formatTzs(payment.amountTzs)}</Text>
          </View>
        ))}

        {sale.changeTzs > 0 ? (
          <View style={styles.line}>
            <Text style={styles.changeLabel}>Chenji · Change</Text>
            <Text testID="receipt-change" style={styles.change}>
              {formatTzs(sale.changeTzs)}
            </Text>
          </View>
        ) : null}

        {sale.debtTzs > 0 ? (
          <View style={styles.line}>
            <Text style={styles.changeLabel}>Deni · Owed</Text>
            <Text testID="receipt-debt" style={styles.debt}>
              {formatTzs(sale.debtTzs)}
            </Text>
          </View>
        ) : null}
      </Card>

      <PrimaryButton
        testID="receipt-new-sale"
        label="Mauzo mapya · New sale"
        onPress={onNewSale}
      />

      <View style={styles.footer}>
        <SecondaryButton testID="receipt-share" label="Tuma risiti · Share receipt" onPress={share} />
        <SecondaryButton testID="receipt-home" label="Rudi mwanzo · Home" onPress={onHome} />
      </View>
    </ScrollView>
  );
}

/** The receipt as plain text, for the phone's own share sheet. */
export function receiptText(sale: Sale): string {
  const lines = sale.lines
    .map(
      (line) =>
        `${line.quantity} × ${line.productName} (${line.unitName}) — ${formatTzs(line.lineTotalTzs)}`,
    )
    .join('\n');

  const payments = sale.payments
    .map(
      (payment) =>
        `${payment.methodName}: ${formatTzs(payment.amountTzs)}${
          payment.debtorName ? ` (${payment.debtorName})` : ''
        }`,
    )
    .join('\n');

  return [
    'SHOPREX',
    new Date(sale.createdAt).toLocaleString(),
    `Muuzaji · Seller: ${sale.soldByName}`,
    '',
    lines,
    '',
    `JUMLA · TOTAL: ${formatTzs(sale.totalTzs)}`,
    payments,
    sale.changeTzs > 0 ? `Chenji · Change: ${formatTzs(sale.changeTzs)}` : '',
    sale.debtTzs > 0 ? `Deni · Owed: ${formatTzs(sale.debtTzs)}` : '',
  ]
    .filter((part) => part !== '')
    .join('\n');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  total: { fontSize: 38, fontWeight: '800', color: colors.emeraldStrong },
  mutedText: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  spaced: { marginTop: spacing.xs },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  lineNames: { flex: 1, paddingRight: spacing.sm },
  lineName: { fontSize: 15, fontWeight: '600', color: colors.text },
  lineDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  lineTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
  changeLabel: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  change: { fontSize: 16, fontWeight: '800', color: colors.kijani },
  debt: { fontSize: 16, fontWeight: '800', color: colors.amber },
  footer: { marginTop: spacing.md, gap: spacing.sm },
});

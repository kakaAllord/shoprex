import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../app/theme';
import { Banner, Card, Field, PrimaryButton, SecondaryButton } from '../../app/ui';
import { formatTzs } from '../../domain/cart';
import {
  PaymentEntry,
  PaymentMethod,
  changeFor,
  paymentState,
  toSalePayments,
} from '../../domain/payment';

/**
 * Taking the money.
 *
 * Tapping a method adds it for whatever is still owed, so the common case — one
 * method, the whole bill — is a single tap. Adding a second method turns the
 * same sheet into a mixed payment without a separate mode to find.
 *
 * The confirm button is disabled with the **reason written next to it** rather
 * than silently: "part of the bill is still unpaid" is something a seller can
 * act on, where a dead button is something they have to guess at. Every one of
 * these rules is re-checked by the backend, which is the actual authority —
 * see `src/domain/payment.ts`.
 */
export function PaymentSheet({
  visible,
  totalTzs,
  methods,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  totalTzs: number;
  methods: PaymentMethod[];
  busy: boolean;
  error: string | null;
  onConfirm: (payments: ReturnType<typeof toSalePayments>) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<PaymentEntry[]>([]);

  const state = useMemo(() => paymentState(totalTzs, entries), [totalTzs, entries]);

  const addMethod = (method: PaymentMethod) => {
    setEntries((current) => {
      if (current.some((entry) => entry.method.id === method.id)) {
        return current;
      }

      // Pre-filled with whatever is still owed: one tap settles a plain sale.
      const outstanding = totalTzs - current.reduce((sum, entry) => sum + entry.amountTzs, 0);

      return [...current, { method, amountTzs: Math.max(outstanding, 0) }];
    });
  };

  const update = (methodId: string, patch: Partial<PaymentEntry>) => {
    setEntries((current) =>
      current.map((entry) => (entry.method.id === methodId ? { ...entry, ...patch } : entry)),
    );
  };

  const remove = (methodId: string) => {
    setEntries((current) => current.filter((entry) => entry.method.id !== methodId));
  };

  const close = () => {
    setEntries([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Malipo</Text>
        <Text testID="payment-total" style={styles.total}>
          {formatTzs(totalTzs)}
        </Text>

        {error ? (
          <Banner testID="payment-error" tone="error" title="Mauzo hayajakamilika · Sale not completed">
            <Text style={styles.mutedText}>{error}</Text>
          </Banner>
        ) : null}

        <Text style={styles.sectionLabel}>Namna ya kulipa · How they are paying</Text>
        <View style={styles.chips}>
          {methods.map((method) => {
            const chosen = entries.some((entry) => entry.method.id === method.id);

            return (
              <Pressable
                key={method.id}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                testID={`payment-method-${method.id}`}
                onPress={() => addMethod(method)}
                style={({ pressed }) => [
                  styles.chip,
                  chosen && styles.chipChosen,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipText, chosen && styles.chipTextChosen]}>
                  {method.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {entries.length === 0 ? (
          <Text style={styles.mutedText}>
            Gusa namna ya kulipa hapo juu · Tap a method above to start.
          </Text>
        ) : null}

        {entries.map((entry) => (
          <Card key={entry.method.id}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryName}>{entry.method.name}</Text>
              <Pressable
                accessibilityRole="button"
                testID={`payment-remove-${entry.method.id}`}
                onPress={() => remove(entry.method.id)}
              >
                <Text style={styles.removeText}>Ondoa · Remove</Text>
              </Pressable>
            </View>

            <Field
              label="Kiasi · Amount"
              testID={`payment-amount-${entry.method.id}`}
              value={entry.amountTzs > 0 ? String(entry.amountTzs) : ''}
              onChangeText={(text) =>
                update(entry.method.id, {
                  amountTzs: Number.parseInt(text.replace(/[^0-9]/g, ''), 10) || 0,
                })
              }
              keyboardType="number-pad"
              editable={!busy}
            />

            {entry.method.kind === 'CASH' ? (
              <>
                <Field
                  label="Pesa aliyotoa · Cash given"
                  testID={`payment-cash-${entry.method.id}`}
                  value={entry.cashReceivedTzs ? String(entry.cashReceivedTzs) : ''}
                  onChangeText={(text) =>
                    update(entry.method.id, {
                      cashReceivedTzs:
                        Number.parseInt(text.replace(/[^0-9]/g, ''), 10) || null,
                    })
                  }
                  keyboardType="number-pad"
                  hint="Acha wazi kama pesa ilikuwa sawasawa · Leave blank when the money was exact."
                  editable={!busy}
                />
                {changeFor(entry) !== null ? (
                  <Banner
                    testID={`payment-change-${entry.method.id}`}
                    tone="success"
                    title={`Chenji · Change: ${formatTzs(changeFor(entry) as number)}`}
                  />
                ) : null}
              </>
            ) : null}

            {entry.method.kind === 'DEBT' ? (
              <Field
                label="Jina la mdaiwa · Debtor’s name"
                testID={`payment-debtor-${entry.method.id}`}
                value={entry.debtorName ?? ''}
                onChangeText={(text) => update(entry.method.id, { debtorName: text })}
                placeholder="Mama Asha"
                hint="Jina tu. Shoprex haifungui akaunti ya mteja · A name only — Shoprex opens no customer account."
                editable={!busy}
              />
            ) : null}
          </Card>
        ))}

        <Card>
          <Row label="Jumla · Total" value={formatTzs(state.totalTzs)} />
          <Row label="Imelipwa · Settled" value={formatTzs(state.settledTzs)} />
          <Row
            label="Iliyobaki · Remaining"
            value={formatTzs(state.remainingTzs)}
            testID="payment-remaining"
          />
          {state.changeTzs > 0 ? (
            <Row label="Chenji · Change" value={formatTzs(state.changeTzs)} />
          ) : null}
        </Card>

        {state.blockedBecause ? (
          <Text testID="payment-blocked" style={styles.blocked}>
            {state.blockedBecause}
          </Text>
        ) : null}

        <PrimaryButton
          testID="payment-confirm"
          label={busy ? 'Inakamilisha…' : 'Maliza mauzo · Complete sale'}
          busy={busy}
          disabled={!state.ready}
          onPress={() => onConfirm(toSalePayments(entries))}
        />

        <View style={styles.footer}>
          <SecondaryButton testID="payment-cancel" label="Rudi · Back" onPress={close} />
        </View>
      </ScrollView>
    </Modal>
  );
}

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text testID={testID} style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  total: { fontSize: 34, fontWeight: '800', color: colors.emeraldStrong, marginBottom: spacing.lg },
  sectionLabel: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipChosen: { backgroundColor: colors.emeraldSoft, borderColor: colors.emerald },
  chipPressed: { opacity: 0.7 },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  chipTextChosen: { color: colors.emeraldStrong },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  entryName: { fontSize: 16, fontWeight: '700', color: colors.text },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', marginBottom: spacing.xs },
  rowLabel: { flex: 1, color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  blocked: { color: colors.amber, fontSize: 13, marginBottom: spacing.sm },
  mutedText: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.md },
  footer: { marginTop: spacing.sm },
});

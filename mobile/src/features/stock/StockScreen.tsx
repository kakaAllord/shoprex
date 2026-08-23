import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../app/theme';
import { Banner, Card, Empty, Field, Loading, SecondaryButton } from '../../app/ui';
import { ApiClient, ProductStock, ShoprexApiError } from '../../core/api/apiClient';

/**
 * Stoo — what this branch actually holds.
 *
 * In shop language, not ledger language: `5 Carton + 5 Piece`, exactly as the
 * backend describes the physical package state, because that is what somebody
 * counting the shelf would say. The normalized quantity the engine reckons in
 * is deliberately not on this screen — AGENT.md keeps normalized mathematics
 * away from workers unless it explains an operational outcome, and "how many
 * boxes are there" is answered by the boxes.
 *
 * **A negative line is not an error and is not hidden.** Since the negative
 * stock policy (doc 02 §5) a shop that sold five with two counted sits at -3,
 * and that number is the most useful thing on the screen: it is the shop being
 * told its count is wrong and by how much. It is marked in amber and named as
 * something to recount, never as a failure.
 */
export function StockScreen({
  apiClient,
  branchId,
  onBack,
  onSessionOver,
}: {
  apiClient: ApiClient;
  branchId: string;
  onBack: () => void;
  onSessionOver: (message: string) => void;
}) {
  const [stock, setStock] = useState<ProductStock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    setForbidden(false);

    try {
      setStock(await apiClient.listBranchStock(branchId));
    } catch (caught) {
      setStock(null);

      if (caught instanceof ShoprexApiError && caught.isSessionOver) {
        onSessionOver(caught.message);
      }

      // A permission taken away mid-shift lands here. It is not a fault to
      // retry, so it gets its own state rather than a "try again" button that
      // will keep answering the same way.
      if (caught instanceof ShoprexApiError && caught.isForbidden) {
        setForbidden(true);

        return;
      }

      setError(
        caught instanceof ShoprexApiError
          ? caught.message
          : 'Seva haipatikani · Cannot reach the Shoprex server',
      );
    }
  }, [apiClient, branchId, onSessionOver]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (term.length === 0 || stock === null) {
      return stock ?? [];
    }

    return stock.filter((item) => item.productName.toLowerCase().includes(term));
  }, [stock, query]);

  const short = useMemo(
    () => (stock ?? []).filter((item) => item.normalizedQuantity < 0).length,
    [stock],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Stoo</Text>
        <SecondaryButton testID="stock-back" label="Rudi · Back" onPress={onBack} />
      </View>

      {forbidden ? (
        <Banner
          testID="stock-forbidden"
          tone="warning"
          title="Huna ruhusa ya kuona stoo · Viewing stock is not granted"
        >
          <Text style={styles.mutedText}>
            Mmiliki wa duka ndiye anayetoa ruhusa hii · Ask the shop owner to grant you
            the VIEW_STOCK permission, then sign in again.
          </Text>
        </Banner>
      ) : null}

      {error ? (
        <Banner testID="stock-error" tone="error" title="Stoo haijapatikana · Stock not loaded">
          <Text style={styles.mutedText}>{error}</Text>
          <SecondaryButton
            testID="stock-retry"
            label="Jaribu tena · Try again"
            onPress={() => {
              void load();
            }}
          />
        </Banner>
      ) : null}

      {stock === null && !error && !forbidden ? (
        <Loading label="Inapakia stoo… · Loading the stock…" />
      ) : null}

      {stock !== null ? (
        <>
          {short > 0 ? (
            <Banner
              testID="stock-short"
              tone="warning"
              title={`Bidhaa ${short} zinahitaji kuhesabiwa upya · ${short} item(s) need recounting`}
            >
              <Text style={styles.mutedText}>
                Zimeuzwa zaidi ya zilizoandikwa kupokelewa. Hesabu upya, kisha pokea
                kilichobaki · More was sold than was recorded as received. Recount, then
                receive what is missing — the balance corrects itself.
              </Text>
            </Banner>
          ) : null}

          {stock.length === 0 ? (
            <Empty
              title="Stoo ni tupu · Nothing on the shelf yet"
              hint="Pokea mzigo ili kuanza · Receive a delivery to start."
            />
          ) : (
            <>
              <Field
                label="Tafuta kwenye stoo · Search the stock"
                testID="stock-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Coca-Cola…"
                autoCorrect={false}
              />

              {shown.length === 0 ? (
                <Empty title="Hakuna bidhaa yenye jina hilo · No item by that name" />
              ) : (
                shown.map((item) => <StockRow key={item.productId} item={item} />)
              )}
            </>
          )}

          <View style={styles.footer}>
            <SecondaryButton
              testID="stock-refresh"
              label="Onyesha upya · Refresh"
              onPress={() => {
                void load();
              }}
            />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function StockRow({ item }: { item: ProductStock }) {
  const isShort = item.normalizedQuantity < 0;

  return (
    <Card>
      <Text style={styles.productName}>{item.productName}</Text>

      {item.packages.length === 0 ? (
        <Text testID={`stock-packages-${item.productId}`} style={styles.none}>
          Hakuna · None
        </Text>
      ) : (
        <Text
          testID={`stock-packages-${item.productId}`}
          style={[styles.packages, isShort && styles.packagesShort]}
        >
          {item.packages
            .map((packaging) => `${packaging.quantity} ${packaging.unitName}`)
            .join('  +  ')}
        </Text>
      )}

      {isShort ? (
        <View testID={`stock-short-${item.productId}`} style={styles.shortNote}>
          <Text style={styles.shortNoteText}>
            Pungufu · Short. Hesabu upya bidhaa hii · Recount this item.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  productName: { fontSize: 16, fontWeight: '700', color: colors.text },
  packages: { fontSize: 18, fontWeight: '700', color: colors.emeraldStrong, marginTop: spacing.xs },
  packagesShort: { color: colors.amber },
  none: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  shortNote: {
    marginTop: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.button,
    padding: spacing.sm,
  },
  shortNoteText: { color: colors.amber, fontSize: 13, fontWeight: '600' },
  mutedText: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  footer: { marginTop: spacing.md },
});

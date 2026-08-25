import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../../app/theme';
import {
  Banner,
  Card,
  Empty,
  Field,
  Loading,
  PrimaryButton,
  SecondaryButton,
} from '../../app/ui';
import { ApiClient, Product, ShoprexApiError, StockReceipt } from '../../core/api/apiClient';
import { formatTzs } from '../../domain/cart';
import {
  Basket,
  ReceivableUnit,
  addToBasket,
  anyCostRecorded,
  basketCostTzs,
  basketItemCount,
  costIsComplete,
  emptyBasket,
  removeFromBasket,
  resolveReceivingUnit,
  setBasketQuantity,
  setLineCost,
  toReceiptLines,
} from '../../domain/receiving';
import { newIdempotencyKey } from '../../core/session/sessionStore';
import { NewProductSheet } from '../../components/NewProductSheet';
import { ScannerSheet } from '../../components/ScannerSheet';

/**
 * Pokea mzigo — putting a delivery on the shelf.
 *
 * The same three ways in as Mauzo, deliberately: scan it, type it, or add it
 * if the shop has never carried it. A person unpacking a lorry should not have
 * to learn a second way to find a product, so this reuses `ScannerSheet` and
 * `NewProductSheet` rather than growing look-alikes of them.
 *
 * Where it diverges from selling, it diverges on purpose, and the reasons are
 * in `src/domain/receiving.ts`: every packaging can be received whether or not
 * it has been priced, a line carries an optional **cost** rather than a price,
 * and there is no money to settle at the end. What the shop paid is recorded
 * only if the shop says; V1 does no profit accounting with it.
 *
 * The whole delivery is sent as **one** request, because the backend records
 * it as one transaction — a receipt that fails on its third line leaves none
 * of it in stock. There is no partial state for the phone to reconcile, which
 * is what keeps V1 online-only honest.
 */
export function ReceiveScreen({
  apiClient,
  branchId,
  deviceId,
  onBack,
  onOpenStock,
  onSessionOver,
}: {
  apiClient: ApiClient;
  branchId: string;
  deviceId: string | null;
  onBack: () => void;
  onOpenStock: (() => void) | null;
  onSessionOver: (message: string) => void;
}) {
  const [basket, setBasket] = useState<Basket>(emptyBasket);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'warning' | 'error' | 'success'; text: string } | null>(
    null,
  );

  const [scannerOpen, setScannerOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ product: Product; units: ReceivableUnit[] } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<StockReceipt | null>(null);

  const receiptCounter = useRef(0);

  /**
   * The idempotency key for the delivery currently being saved.
   *
   * Minted once and **reused by every retry**, for exactly the reason Mauzo
   * does the same (see `SaleScreen`): the backend commits the delivery and the
   * response is lost, and a stock keeper who presses Hifadhi again must not
   * receive the crate twice. Cleared on success, and whenever the basket is
   * edited — a changed basket is a different delivery, not a retry.
   */
  const pendingKey = useRef<string | null>(null);

  useEffect(() => {
    pendingKey.current = null;
  }, [basket]);

  const handleApiError = useCallback(
    (caught: unknown, fallback: string): string => {
      if (caught instanceof ShoprexApiError && caught.isSessionOver) {
        onSessionOver(caught.message);
      }

      return caught instanceof ShoprexApiError ? caught.message : fallback;
    },
    [onSessionOver],
  );

  // Suggestions as the name is typed, settled briefly so a four-letter word is
  // one request rather than four. Same 300ms as Mauzo — a person who has used
  // one screen should not find the other behaves differently.
  useEffect(() => {
    const term = query.trim();

    if (term.length < 2) {
      setResults(null);
      setSearching(false);

      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          setResults(await apiClient.searchProducts(term));
        } catch (caught) {
          setNotice({
            tone: 'error',
            text: handleApiError(caught, 'Utafutaji haujafanikiwa · Search failed'),
          });
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [query, apiClient, handleApiError]);

  /** One place where a product becomes a basket line, whatever found it. */
  const offer = useCallback((product: Product) => {
    // Unlike a sale, nothing here can turn a product away: an unpriced Gunia
    // is still a Gunia somebody carried in.
    const resolution = resolveReceivingUnit(product);

    if (resolution.kind === 'add') {
      setBasket((current) => addToBasket(current, product, resolution.unit.id));
      setNotice({ tone: 'success', text: `${product.name} imeongezwa · added` });

      return;
    }

    setChoice({ product, units: resolution.units });
  }, []);

  const onScanned = async (barcode: string) => {
    setScannerOpen(false);
    setNotice(null);

    try {
      offer(await apiClient.lookupBarcode(barcode));
    } catch (caught) {
      if (caught instanceof ShoprexApiError && caught.isNotFound) {
        // A code the shop has never carried. That is the moment to add it, not
        // an error to bounce the person off.
        setPendingBarcode(barcode);
        setNewProductOpen(true);

        return;
      }

      setNotice({
        tone: 'error',
        text: handleApiError(caught, 'Namba haijasomeka · That barcode could not be read'),
      });
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      if (pendingKey.current === null) {
        receiptCounter.current += 1;
        pendingKey.current = newIdempotencyKey(deviceId, receiptCounter.current);
      }

      const receipt = await apiClient.receiveStock(branchId, {
        lines: toReceiptLines(basket),
        idempotencyKey: pendingKey.current,
      });

      pendingKey.current = null;

      setBasket(emptyBasket);
      setQuery('');
      setResults(null);
      setNotice(null);
      setSaved(receipt);
    } catch (caught) {
      // The key is left standing on purpose: the phone cannot tell whether the
      // delivery committed, so pressing Hifadhi again must ask the same
      // question rather than a new one.
      setSaveError(
        handleApiError(
          caught,
          'Mzigo haujahifadhiwa · The delivery could not be recorded. Bonyeza Hifadhi tena — hautapokelewa mara mbili.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const count = basketItemCount(basket);
  const costRecorded = anyCostRecorded(basket);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Pokea mzigo</Text>
          <SecondaryButton testID="receive-back" label="Rudi · Back" onPress={onBack} />
        </View>

        {saved ? (
          <Banner
            testID="receive-saved"
            tone="success"
            title="Mzigo umehifadhiwa · The delivery is on the shelf"
          >
            {saved.lines.map((line) => (
              <Text key={`${line.productId}:${line.unitId}`} style={styles.savedLine}>
                {line.quantity} × {line.unitName} — {line.productName}
              </Text>
            ))}
            <Text style={styles.mutedText}>
              Imeandikwa na {saved.receivedByName} · Recorded by {saved.receivedByName}.
            </Text>
            {onOpenStock ? (
              <SecondaryButton
                testID="receive-open-stock"
                label="Angalia stoo · See the stock"
                tone="success"
                onPress={onOpenStock}
              />
            ) : null}
          </Banner>
        ) : null}

        {saveError ? (
          <Banner testID="receive-error" tone="error" title="Haijahifadhiwa · Not recorded">
            <Text style={styles.mutedText}>{saveError}</Text>
            <Text style={styles.mutedText}>
              Hakuna kilichoingia stoo. Jaribu tena · Nothing went onto the shelf. The
              delivery is still here — try again.
            </Text>
          </Banner>
        ) : null}

        {notice ? (
          <Banner
            testID="receive-notice"
            tone={notice.tone}
            title={notice.tone === 'success' ? 'Imeongezwa · Added' : 'Angalia · Note'}
          >
            <Text style={styles.mutedText}>{notice.text}</Text>
          </Banner>
        ) : null}

        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Field
              label="Tafuta bidhaa · Search"
              testID="receive-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Coca-Cola…"
              autoCorrect={false}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            testID="receive-scan"
            onPress={() => setScannerOpen(true)}
            style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
          >
            <Text style={styles.scanButtonText}>Soma</Text>
            <Text style={styles.scanButtonSubtext}>Scan</Text>
          </Pressable>
        </View>

        {searching ? <Loading label="Inatafuta… · Searching…" /> : null}

        {!searching && results !== null && results.length === 0 ? (
          <View>
            <Empty
              title="Hakuna bidhaa yenye jina hilo · No product by that name"
              hint="Unaweza kuiongeza sasa hivi · You can add it right now."
            />
            <SecondaryButton
              testID="receive-add-unknown"
              label="Ongeza bidhaa mpya · Add a new product"
              tone="success"
              onPress={() => {
                setPendingBarcode(null);
                setNewProductOpen(true);
              }}
            />
          </View>
        ) : null}

        {!searching && results !== null && results.length > 0
          ? results.map((product) => (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                testID={`receive-result-${product.id}`}
                onPress={() => offer(product)}
                style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
              >
                <Text style={styles.resultName}>{product.name}</Text>
                <Text style={styles.resultUnits}>
                  {product.units.map((unit) => unit.name).join('  ·  ')}
                </Text>
              </Pressable>
            ))
          : null}

        <Text style={styles.sectionLabel}>Mzigo · Delivery ({count})</Text>

        {basket.length === 0 ? (
          <Empty
            title="Bado hakuna kitu kwenye mzigo · Nothing in this delivery yet"
            hint="Soma namba ya bidhaa au andika jina · Scan a barcode or type a name."
          />
        ) : (
          basket.map((line) => (
            <Card key={`${line.productId}:${line.unitId}`}>
              <View style={styles.lineHeader}>
                <View style={styles.lineNames}>
                  <Text style={styles.lineName}>{line.productName}</Text>
                  <Text style={styles.lineUnit}>{line.unitName}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  testID={`basket-remove-${line.unitId}`}
                  onPress={() =>
                    setBasket((current) => removeFromBasket(current, line.productId, line.unitId))
                  }
                >
                  <Text style={styles.removeText}>Ondoa · Remove</Text>
                </Pressable>
              </View>

              <View style={styles.stepper}>
                <StepperButton
                  testID={`basket-decrement-${line.unitId}`}
                  label="−"
                  onPress={() =>
                    setBasket((current) =>
                      setBasketQuantity(current, line.productId, line.unitId, line.quantity - 1),
                    )
                  }
                />
                {/* Typed as well as stepped: a delivery is 120 Pieces as often
                    as it is 2, and nobody should tap + a hundred times. */}
                <TextInput
                  accessibilityLabel={`Idadi ya ${line.unitName}`}
                  testID={`basket-quantity-${line.unitId}`}
                  style={styles.quantityInput}
                  value={String(line.quantity)}
                  keyboardType="number-pad"
                  onChangeText={(text) => {
                    const digits = text.replace(/[^0-9]/g, '');
                    const next = digits === '' ? 0 : Number.parseInt(digits, 10);

                    setBasket((current) =>
                      setBasketQuantity(current, line.productId, line.unitId, next),
                    );
                  }}
                />
                <StepperButton
                  testID={`basket-increment-${line.unitId}`}
                  label="+"
                  onPress={() =>
                    setBasket((current) =>
                      setBasketQuantity(current, line.productId, line.unitId, line.quantity + 1),
                    )
                  }
                />
              </View>

              <Field
                label="Gharama ya kimoja · Cost for one (si lazima)"
                testID={`basket-cost-${line.unitId}`}
                value={line.unitCostTzs === null ? '' : String(line.unitCostTzs)}
                keyboardType="number-pad"
                placeholder="9000"
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, '');

                  setBasket((current) =>
                    setLineCost(
                      current,
                      line.productId,
                      line.unitId,
                      digits === '' ? null : Number.parseInt(digits, 10),
                    ),
                  );
                }}
              />
            </Card>
          ))
        )}
      </ScrollView>

      <View style={styles.saveBar}>
        <View>
          <Text style={styles.saveBarLabel}>Vipimo · Packages</Text>
          <Text testID="receive-count" style={styles.saveBarCount}>
            {count}
          </Text>
          {costRecorded ? (
            <Text testID="receive-cost" style={styles.saveBarCost}>
              {costIsComplete(basket)
                ? `Gharama · Cost ${formatTzs(basketCostTzs(basket))}`
                : `Sehemu ya gharama · Part of the cost ${formatTzs(basketCostTzs(basket))}`}
            </Text>
          ) : null}
        </View>
        <View style={styles.saveButton}>
          <PrimaryButton
            testID="receive-save"
            label="Hifadhi mzigo · Save"
            busy={saving}
            disabled={basket.length === 0}
            onPress={() => {
              void save();
            }}
          />
        </View>
      </View>

      <ScannerSheet
        visible={scannerOpen}
        onScanned={(barcode) => {
          void onScanned(barcode);
        }}
        onClose={() => setScannerOpen(false)}
      />

      <NewProductSheet
        visible={newProductOpen}
        apiClient={apiClient}
        initialName={pendingBarcode ? '' : query}
        barcode={pendingBarcode}
        // A delivery does not need a selling price, so this is the one caller
        // that does not insist on one. See the sheet's own note.
        requirePrice={false}
        onCreated={(product) => {
          setNewProductOpen(false);
          setPendingBarcode(null);
          setQuery('');
          setResults(null);
          offer(product);
        }}
        onClose={() => {
          setNewProductOpen(false);
          setPendingBarcode(null);
        }}
      />

      {choice ? (
        <UnitChoice
          productName={choice.product.name}
          units={choice.units}
          onPick={(unitId) => {
            setBasket((current) => addToBasket(current, choice.product, unitId));
            setChoice(null);
          }}
          onClose={() => setChoice(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * Which packaging arrived. Only ever shown when the product has more than one
 * — a shop that only counts Gunia is never asked.
 */
function UnitChoice({
  productName,
  units,
  onPick,
  onClose,
}: {
  productName: string;
  units: ReceivableUnit[];
  onPick: (unitId: string) => void;
  onClose: () => void;
}) {
  return (
    <View testID="receive-unit-choice" style={styles.sheet}>
      <Card>
        <Text style={styles.lineName}>{productName}</Text>
        <Text style={styles.mutedText}>Umepokea kipimo kipi? · Which packaging arrived?</Text>

        {units.map((unit) => (
          <Pressable
            key={unit.id}
            accessibilityRole="button"
            testID={`receive-unit-choice-${unit.id}`}
            onPress={() => onPick(unit.id)}
            style={({ pressed }) => [styles.unitOption, pressed && styles.resultPressed]}
          >
            <Text style={styles.unitOptionName}>{unit.name}</Text>
          </Pressable>
        ))}

        <SecondaryButton
          testID="receive-unit-choice-cancel"
          label="Ghairi · Cancel"
          onPress={onClose}
        />
      </Card>
    </View>
  );
}

function StepperButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.stepperButton, pressed && styles.resultPressed]}
    >
      <Text style={styles.stepperButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: 140 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  searchField: { flex: 1 },
  scanButton: {
    backgroundColor: colors.emerald,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    height: 52,
    marginTop: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonPressed: { backgroundColor: colors.emeraldStrong },
  scanButtonText: { color: colors.surface, fontWeight: '700', fontSize: 15 },
  scanButtonSubtext: { color: colors.emeraldSoft, fontSize: 11 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  result: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  resultPressed: { opacity: 0.7 },
  resultName: { fontSize: 16, fontWeight: '600', color: colors.text },
  resultUnits: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  lineNames: { flex: 1 },
  lineName: { fontSize: 16, fontWeight: '700', color: colors.text },
  lineUnit: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  stepperButtonText: { fontSize: 22, fontWeight: '700', color: colors.text },
  quantityInput: {
    minWidth: 80,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  savedLine: { color: colors.text, fontSize: 14, fontWeight: '600' },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  saveBarLabel: { color: colors.textMuted, fontSize: 12 },
  saveBarCount: { color: colors.text, fontSize: 24, fontWeight: '800' },
  saveBarCost: { color: colors.textMuted, fontSize: 12 },
  saveButton: { flex: 1, maxWidth: 200 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(20,35,29,0.35)',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  unitOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unitOptionName: { fontSize: 16, fontWeight: '600', color: colors.text },
  mutedText: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
});

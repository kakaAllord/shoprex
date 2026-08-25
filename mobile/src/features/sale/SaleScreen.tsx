import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import {
  ApiClient,
  Product,
  Sale,
  PaymentMethod as ApiPaymentMethod,
  ShoprexApiError,
} from '../../core/api/apiClient';
import { newIdempotencyKey } from '../../core/session/sessionStore';
import {
  Cart,
  SellableUnit,
  addToCart,
  cartItemCount,
  cartTotalTzs,
  emptyCart,
  formatTzs,
  lineTotalTzs,
  removeFromCart,
  resolveUnit,
  setQuantity,
  toSaleLines,
} from '../../domain/cart';
import { PaymentMethod } from '../../domain/payment';
import { NewProductSheet } from '../../components/NewProductSheet';
import { PaymentSheet } from './PaymentSheet';
import { ScannerSheet } from '../../components/ScannerSheet';

/**
 * Mauzo — the screen the whole product is for.
 *
 * The flow is doc 01 §5's, in order: scan or type, add, adjust, pay. Every
 * decision about *what a scan means* comes from `src/domain/cart.ts` rather
 * than from this file — a single sellable unit adds itself at quantity 1, a
 * rescan increments the line already there, and several units open a choice.
 * This component's job is to render that and to talk to the backend.
 *
 * The backend is the authority on the sale. The totals here are what the
 * customer is shown while deciding; the numbers that get stored are the ones
 * the backend recomputes when the sale is completed.
 */

type Choice = { product: Product; units: SellableUnit[] } | null;

export function SaleScreen({
  apiClient,
  branchId,
  deviceId,
  onDone,
  onBack,
  onSessionOver,
}: {
  apiClient: ApiClient;
  branchId: string;
  deviceId: string | null;
  onDone: (sale: Sale) => void;
  onBack: () => void;
  onSessionOver: (message: string) => void;
}) {
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'warning' | 'error' | 'success'; text: string } | null>(
    null,
  );

  const [methods, setMethods] = useState<ApiPaymentMethod[] | null>(null);
  const [methodsError, setMethodsError] = useState<string | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>(null);

  const [completing, setCompleting] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  const saleCounter = useRef(0);

  const total = cartTotalTzs(cart);

  const handleApiError = useCallback(
    (caught: unknown, fallback: string): string => {
      if (caught instanceof ShoprexApiError && caught.isSessionOver) {
        onSessionOver(caught.message);
      }

      return caught instanceof ShoprexApiError ? caught.message : fallback;
    },
    [onSessionOver],
  );

  // The payment methods are the checkout buttons, so they are fetched once
  // when the screen opens rather than at the moment the seller is waiting.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const list = await apiClient.listPaymentMethods();

        if (!cancelled) {
          setMethods(list);
          setMethodsError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setMethodsError(
            handleApiError(caught, 'Seva haipatikani · Cannot reach the Shoprex server'),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiClient, handleApiError]);

  // Suggestions as the seller types, settled briefly so a four-letter word is
  // one request rather than four.
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

  /** One place where a product becomes a cart line, whatever found it. */
  const offer = useCallback((product: Product) => {
    const resolution = resolveUnit(product);

    if (resolution.kind === 'unpriced') {
      setNotice({
        tone: 'warning',
        text: `${product.name} haina bei bado · ${product.name} has no price yet, so it cannot be sold. Ask the owner to price it.`,
      });

      return;
    }

    if (resolution.kind === 'add') {
      setCart((current) => addToCart(current, product, resolution.unit.id));
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
        // A valid barcode for something the shop has never sold. That is the
        // inline-creation moment, not an error to bounce off.
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

  const complete = async (payments: Array<Record<string, unknown>>) => {
    setCompleting(true);
    setSaleError(null);

    try {
      saleCounter.current += 1;

      const sale = await apiClient.completeSale(branchId, {
        idempotencyKey: newIdempotencyKey(deviceId, saleCounter.current),
        lines: toSaleLines(cart),
        payments: payments as never,
      });

      setCart(emptyCart);
      setPaymentOpen(false);
      onDone(sale);
    } catch (caught) {
      setSaleError(
        handleApiError(caught, 'Mauzo hayajakamilika · The sale could not be completed'),
      );
    } finally {
      setCompleting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Mauzo</Text>
          <SecondaryButton testID="sale-back" label="Rudi · Back" onPress={onBack} />
        </View>

        {methodsError ? (
          <Banner testID="sale-methods-error" tone="error" title="Namna za kulipa hazijapatikana">
            <Text style={styles.mutedText}>{methodsError}</Text>
          </Banner>
        ) : null}

        {notice ? (
          <Banner
            testID="sale-notice"
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
              testID="sale-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Coca-Cola…"
              autoCorrect={false}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            testID="sale-scan"
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
              testID="sale-add-unknown"
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
                testID={`sale-result-${product.id}`}
                onPress={() => offer(product)}
                style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
              >
                <Text style={styles.resultName}>{product.name}</Text>
                <Text style={styles.resultUnits}>
                  {product.units
                    .map((unit) =>
                      unit.priceTzs === null
                        ? `${unit.name} — hakuna bei`
                        : `${unit.name} ${formatTzs(unit.priceTzs)}`,
                    )
                    .join('  ·  ')}
                </Text>
              </Pressable>
            ))
          : null}

        <Text style={styles.sectionLabel}>
          Kikapu · Cart ({cartItemCount(cart)})
        </Text>

        {cart.length === 0 ? (
          <Empty
            title="Kikapu ni kitupu · The cart is empty"
            hint="Soma namba ya bidhaa au andika jina · Scan a barcode or type a name."
          />
        ) : (
          cart.map((line) => (
            <Card key={`${line.productId}:${line.unitId}`}>
              <View style={styles.lineHeader}>
                <View style={styles.lineNames}>
                  <Text style={styles.lineName}>{line.productName}</Text>
                  <Text style={styles.lineUnit}>
                    {line.unitName} · {formatTzs(line.unitPriceTzs)}
                  </Text>
                </View>
                <Text testID={`cart-line-total-${line.unitId}`} style={styles.lineTotal}>
                  {formatTzs(lineTotalTzs(line))}
                </Text>
              </View>

              <View style={styles.stepper}>
                <StepperButton
                  testID={`cart-decrement-${line.unitId}`}
                  label="−"
                  onPress={() =>
                    setCart((current) =>
                      setQuantity(current, line.unitId, line.productId, line.quantity - 1),
                    )
                  }
                />
                <Text testID={`cart-quantity-${line.unitId}`} style={styles.quantity}>
                  {line.quantity}
                </Text>
                <StepperButton
                  testID={`cart-increment-${line.unitId}`}
                  label="+"
                  onPress={() =>
                    setCart((current) =>
                      setQuantity(current, line.unitId, line.productId, line.quantity + 1),
                    )
                  }
                />
                <View style={styles.spacer} />
                <Pressable
                  accessibilityRole="button"
                  testID={`cart-remove-${line.unitId}`}
                  onPress={() =>
                    setCart((current) => removeFromCart(current, line.productId, line.unitId))
                  }
                >
                  <Text style={styles.removeText}>Ondoa · Remove</Text>
                </Pressable>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <View style={styles.payBar}>
        <View>
          <Text style={styles.payBarLabel}>Jumla · Total</Text>
          <Text testID="sale-total" style={styles.payBarTotal}>
            {formatTzs(total)}
          </Text>
        </View>
        <View style={styles.payButton}>
          <PrimaryButton
            testID="sale-pay"
            label="Lipa · Pay"
            disabled={cart.length === 0 || methods === null}
            onPress={() => {
              setSaleError(null);
              setPaymentOpen(true);
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

      <PaymentSheet
        visible={paymentOpen}
        totalTzs={total}
        methods={(methods ?? []) as PaymentMethod[]}
        busy={completing}
        error={saleError}
        onConfirm={(payments) => {
          void complete(payments as Array<Record<string, unknown>>);
        }}
        onClose={() => setPaymentOpen(false)}
      />

      {choice ? (
        <UnitChoice
          product={choice.product}
          units={choice.units}
          onPick={(unitId) => {
            setCart((current) => addToCart(current, choice.product, unitId));
            setChoice(null);
          }}
          onClose={() => setChoice(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * Which packaging is being sold. Only ever shown when there is a genuine
 * choice — one sellable unit adds itself without asking.
 */
function UnitChoice({
  product,
  units,
  onPick,
  onClose,
}: {
  product: Product;
  units: SellableUnit[];
  onPick: (unitId: string) => void;
  onClose: () => void;
}) {
  return (
    <View testID="unit-choice" style={styles.sheet}>
      <Card>
        <Text style={styles.lineName}>{product.name}</Text>
        <Text style={styles.mutedText}>Chagua kipimo · Choose the unit</Text>

        {units
          .filter((unit) => unit.priceTzs !== null)
          .map((unit) => (
            <Pressable
              key={unit.id}
              accessibilityRole="button"
              testID={`unit-choice-${unit.id}`}
              onPress={() => onPick(unit.id)}
              style={({ pressed }) => [styles.unitOption, pressed && styles.resultPressed]}
            >
              <Text style={styles.unitOptionName}>{unit.name}</Text>
              <Text style={styles.unitOptionPrice}>{formatTzs(unit.priceTzs as number)}</Text>
            </Pressable>
          ))}

        <SecondaryButton testID="unit-choice-cancel" label="Ghairi · Cancel" onPress={onClose} />
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
  content: { padding: spacing.lg, paddingBottom: 120 },
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
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  lineNames: { flex: 1 },
  lineName: { fontSize: 16, fontWeight: '700', color: colors.text },
  lineUnit: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  lineTotal: { fontSize: 16, fontWeight: '700', color: colors.emeraldStrong },
  stepper: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
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
  quantity: { fontSize: 18, fontWeight: '700', color: colors.text, minWidth: 40, textAlign: 'center' },
  spacer: { flex: 1 },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  payBar: {
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
  payBarLabel: { color: colors.textMuted, fontSize: 12 },
  payBarTotal: { color: colors.text, fontSize: 24, fontWeight: '800' },
  payButton: { flex: 1, maxWidth: 200 },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unitOptionName: { fontSize: 16, fontWeight: '600', color: colors.text },
  unitOptionPrice: { fontSize: 15, color: colors.emeraldStrong, fontWeight: '700' },
  mutedText: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
});

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../app/theme';
import { Banner, Card, Empty, Field, Loading, PrimaryButton, SecondaryButton } from '../../app/ui';
import { formatTzs } from '../../domain/cart';
import { ApiClient, Product, ShoprexApiError } from '../../core/api/apiClient';
import { NewProductSheet } from '../../components/NewProductSheet';
import { ScannerSheet } from '../../components/ScannerSheet';

/**
 * Bidhaa — the shop's catalogue, and the one place adding to it is the point.
 *
 * Adding a product was always possible on this phone, but only ever as a
 * *rescue*: scan something unknown, or search for a name and find nothing, and
 * an offer to create it appears. That is exactly right in the middle of a sale
 * and quietly wrong the rest of the time — somebody unpacking a delivery of
 * six new lines had to pretend to sell or receive each one to get it into the
 * catalogue, and somebody who simply wanted to check a price had no way in at
 * all.
 *
 * So this screen makes the same `NewProductSheet` reachable without an errand
 * attached, and doubles as the read view: what the shop sells, what each
 * packaging is called, and what it costs.
 *
 * **Price is optional here, and that is deliberate.** `requirePrice` is what
 * separates a sale from everything else — selling cannot invent a price, so
 * the payment path insists on one. Cataloguing an item is doc 01 §6's
 * progressive enrichment: the shop writes down what it now stocks and decides
 * what to charge afterwards. An unpriced product is shown plainly as unpriced,
 * and the backend refuses to sell it until somebody says, which is the honest
 * outcome rather than a hidden one.
 *
 * There is no editing and no discontinuing here. Both belong to the owner and
 * both live in the web console — this phone is for the person standing in the
 * shop, and a worker who could rename or retire a product mid-shift is a
 * worker who can quietly rewrite what the shop sells.
 */
export function ProductsScreen({
  apiClient,
  canAdd,
  onBack,
  onSessionOver,
}: {
  apiClient: ApiClient;
  /** SELL or RECEIVE_STOCK — the same pair the backend's create route takes. */
  canAdd: boolean;
  onBack: () => void;
  onSessionOver: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [searching, setSearching] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleFailure = useCallback(
    (caught: unknown) => {
      if (caught instanceof ShoprexApiError) {
        if (caught.isSessionOver) {
          onSessionOver(caught.message);

          return;
        }

        if (caught.isForbidden) {
          setForbidden(true);

          return;
        }

        setError(caught.message);

        return;
      }

      setError('Seva haipatikani · Cannot reach the Shoprex server');
    },
    [onSessionOver],
  );

  const load = useCallback(
    async (search: string) => {
      setError(null);
      setForbidden(false);
      setSearching(true);

      try {
        setProducts(await apiClient.searchProducts(search));
      } catch (caught) {
        handleFailure(caught);
      } finally {
        setSearching(false);
      }
    },
    [apiClient, handleFailure],
  );

  // The catalogue as it stands, before anybody types anything: opening Bidhaa
  // to a blank screen would make the shop look empty.
  useEffect(() => {
    void load('');
  }, [load]);

  /**
   * A scan here means "show me this", not "sell me this".
   *
   * A code the shop already knows scrolls to what it is; one it does not is
   * the same inline-creation moment the sale screen offers, with the barcode
   * carried in — the camera has already been pointed at it once.
   */
  const onScanned = async (barcode: string) => {
    setScannerOpen(false);
    setNotice(null);
    setError(null);

    try {
      const found = await apiClient.lookupBarcode(barcode);

      setProducts([found]);
      setQuery(found.name);
      setNotice(`Imepatikana · Found ${found.name}`);
    } catch (caught) {
      if (caught instanceof ShoprexApiError && caught.isNotFound) {
        setPendingBarcode(barcode);
        setNewProductOpen(true);

        return;
      }

      handleFailure(caught);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bidhaa</Text>
      <Text style={styles.lede}>
        Bidhaa za duka lako · What your shop sells. {canAdd ? 'Ongeza mpya wakati wowote.' : ''}
      </Text>

      {notice ? (
        <Banner testID="products-notice" tone="success" title={notice}>
          <Text style={styles.mutedText}>&nbsp;</Text>
        </Banner>
      ) : null}

      {forbidden ? (
        <Banner
          testID="products-forbidden"
          tone="warning"
          title="Huna ruhusa · You do not have permission"
        >
          <Text style={styles.mutedText}>
            Mmiliki wa duka ndiye anayetoa ruhusa hii · The shop owner grants this.
          </Text>
        </Banner>
      ) : null}

      {error ? (
        <Banner testID="products-error" tone="error" title="Kuna hitilafu · Something went wrong">
          <Text style={styles.mutedText}>{error}</Text>
          <SecondaryButton
            testID="products-retry"
            label="Jaribu tena · Try again"
            onPress={() => {
              void load(query);
            }}
          />
        </Banner>
      ) : null}

      <Card>
        <Field
          label="Tafuta bidhaa · Search products"
          testID="products-search"
          value={query}
          onChangeText={(next) => {
            setQuery(next);
            setNotice(null);
            void load(next);
          }}
          autoCorrect={false}
          placeholder="Sukari, sabuni, soda…"
        />

        <SecondaryButton
          testID="products-scan"
          label="Soma namba · Scan a barcode"
          onPress={() => {
            setNotice(null);
            setScannerOpen(true);
          }}
        />
      </Card>

      {canAdd ? (
        <View style={styles.addBlock}>
          <PrimaryButton
            testID="products-add"
            label="Ongeza bidhaa mpya · Add a new product"
            onPress={() => {
              setPendingBarcode(null);
              setNewProductOpen(true);
            }}
          />
          <Text style={styles.mutedText}>
            Bei si lazima sasa · A price is not required yet — the owner can set it later.
          </Text>
        </View>
      ) : (
        <Banner
          testID="products-cannot-add"
          tone="warning"
          title="Huwezi kuongeza bidhaa · You cannot add products"
        >
          <Text style={styles.mutedText}>
            Unahitaji ruhusa ya kuuza au kupokea mzigo · You need the SELL or
            RECEIVE_STOCK permission. Mmiliki wa duka ndiye anayeitoa.
          </Text>
        </Banner>
      )}

      {searching && products === null ? <Loading label="Inatafuta… · Searching…" /> : null}

      {products !== null && products.length === 0 ? (
        <Empty
          title={
            query.trim()
              ? 'Hakuna bidhaa yenye jina hilo · No product by that name'
              : 'Bado hakuna bidhaa · No products yet'
          }
          hint={canAdd ? 'Unaweza kuiongeza sasa hivi · You can add it right now.' : undefined}
        />
      ) : null}

      {products?.map((product) => (
        <ProductRow key={product.id} product={product} />
      ))}

      <View style={styles.footer}>
        <SecondaryButton testID="products-back" label="Rudi · Back" onPress={onBack} />
      </View>

      <ScannerSheet
        visible={scannerOpen}
        onScanned={onScanned}
        onClose={() => setScannerOpen(false)}
      />

      <NewProductSheet
        visible={newProductOpen}
        apiClient={apiClient}
        barcode={pendingBarcode}
        // Cataloguing is not selling: doc 01 §6's progressive enrichment lets a
        // shop write down what it stocks before deciding what to charge.
        requirePrice={false}
        onCreated={(product) => {
          setNewProductOpen(false);
          setPendingBarcode(null);
          setNotice(`Imeongezwa · Added ${product.name}`);
          setQuery('');
          void load('');
        }}
        onClose={() => {
          setNewProductOpen(false);
          setPendingBarcode(null);
        }}
      />
    </ScrollView>
  );
}

/**
 * One product, in the shop's own terms.
 *
 * Every packaging is listed with its price, because "what does a Kreti cost"
 * is the question this screen exists to answer. A unit nobody has priced says
 * so in words rather than showing `TSh 0`, which would be a lie about a real
 * price of zero.
 */
function ProductRow({ product }: { product: Product }) {
  return (
    <Card style={styles.productCard}>
      <Text style={styles.productName}>{product.name}</Text>

      {product.units.map((unit) => (
        <View key={unit.id} style={styles.unitRow}>
          <Text style={styles.unitName}>
            {unit.name}
            {unit.isBaseUnit ? '' : ` · ${unit.factorToBase}`}
          </Text>
          <Text style={unit.priceTzs === null ? styles.unpriced : styles.price}>
            {unit.priceTzs === null ? 'Haijawekwa bei · Not priced' : formatTzs(unit.priceTzs)}
          </Text>
        </View>
      ))}

      {product.barcodes.length > 0 ? (
        <Text style={styles.barcodes} numberOfLines={1}>
          {product.barcodes.join(', ')}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  lede: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  mutedText: { color: colors.textMuted, fontSize: 13 },
  addBlock: { marginTop: spacing.md, marginBottom: spacing.md, gap: spacing.xs },
  productCard: { marginBottom: spacing.sm },
  productName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  unitName: { color: colors.text, fontSize: 14 },
  price: { color: colors.emeraldStrong, fontSize: 14, fontWeight: '600' },
  unpriced: { color: colors.textMuted, fontSize: 12 },
  barcodes: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 11,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  footer: { marginTop: spacing.lg },
});

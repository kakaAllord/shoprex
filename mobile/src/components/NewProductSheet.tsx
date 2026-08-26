import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../app/theme';
import { Banner, Card, Field, PrimaryButton, SecondaryButton } from '../app/ui';
import { UnitNameField, mergeUnitNames } from './UnitNameField';
import { ApiClient, Product, ShoprexApiError } from '../core/api/apiClient';

/**
 * Adding an item the shop has never recorded before, without leaving whatever
 * you were doing.
 *
 * Doc 01 §5: Shoprex must not force catalogue setup before a shop can sell.
 * So this asks for exactly three things — what it is, what one is called, and
 * what one costs — and the owner completes the rest later from the web. If a
 * scan was what led here, the barcode is carried in automatically, because
 * somebody has already pointed the camera at it once.
 *
 * **Three callers, and `requirePrice` is what separates them.** Mauzo passes
 * it (the default): selling cannot invent a price, so the sheet insists on
 * one. Pokea mzigo and Bidhaa do not: putting a box on a shelf, or writing
 * down what the shop now stocks, is doc 01 §6's progressive enrichment, and
 * demanding a price there would mean a shop could not record an item until
 * somebody had decided what to charge for it. Left blank, the product is
 * created unpriced and the backend refuses to sell it until the shop says,
 * which is the honest outcome rather than a hidden one.
 *
 * It lives in `src/components/` rather than under any one of those three
 * features precisely because it belongs to none of them — see the note on
 * `ScannerSheet`.
 */
export function NewProductSheet({
  visible,
  apiClient,
  initialName,
  barcode,
  requirePrice = true,
  onCreated,
  onClose,
}: {
  visible: boolean;
  apiClient: ApiClient;
  initialName?: string;
  barcode?: string | null;
  requirePrice?: boolean;
  onCreated: (product: Product) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName ?? '');
  const [unitName, setUnitName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitNames, setUnitNames] = useState<string[]>(mergeUnitNames([]));

  // What this shop already calls its units, so the picker suggests the shop's
  // own habits before Shoprex's guesses. Fetched when the sheet opens; a
  // failure is silent because the common names alone are still a usable list.
  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const names = await apiClient.listUnitNames();

        if (!cancelled) {
          setUnitNames(mergeUnitNames(names));
        }
      } catch {
        // Keep the common names; the seller can still choose or add one.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, apiClient]);

  const priceTzs = Number.parseInt(price, 10);
  const priced = Number.isInteger(priceTzs) && priceTzs > 0;
  const ready =
    name.trim().length > 1 && unitName.trim().length > 0 && (priced || !requirePrice);

  const reset = () => {
    setName(initialName ?? '');
    setUnitName('');
    setPrice('');
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const product = await apiClient.createProduct({
        name: name.trim(),
        units: [{ name: unitName.trim(), ...(priced ? { priceTzs } : {}) }],
        ...(barcode ? { barcode } : {}),
      });

      reset();
      onCreated(product);
    } catch (caught) {
      setError(
        caught instanceof ShoprexApiError
          ? caught.message
          : 'Seva haipatikani · Cannot reach the Shoprex server',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Bidhaa mpya</Text>
        <Text style={styles.lede}>
          {requirePrice
            ? 'Andika kinachohitajika kuuza sasa. Mmiliki atakamilisha mengine baadaye · Enter only what is needed to sell it now.'
            : 'Andika kinachohitajika kuiweka stoo sasa. Bei inaweza kusubiri · Enter only what is needed to shelve it now. The price can wait.'}
        </Text>

        {barcode ? (
          <Banner testID="new-product-barcode" tone="neutral" title="Namba ya bidhaa · Barcode">
            <Text style={styles.mutedText}>{barcode}</Text>
          </Banner>
        ) : null}

        {error ? (
          <Banner testID="new-product-error" tone="error" title="Haijahifadhiwa · Not saved">
            <Text style={styles.mutedText}>{error}</Text>
          </Banner>
        ) : null}

        <Card>
          <Field
            label="Jina la bidhaa · Product name"
            testID="new-product-name"
            value={name}
            onChangeText={setName}
            placeholder="Sabuni ya Mche"
            editable={!busy}
          />
          <UnitNameField
            label="Kipimo · Unit"
            names={unitNames}
            value={unitName}
            onChange={setUnitName}
            editable={!busy}
            hint="Chagua kutoka orodha, au andika jina jipya na ugonge + · Choose from the list, or type a new name and tap +. More packagings can be added later."
          />
          <Field
            label={
              requirePrice
                ? 'Bei ya kipimo kimoja · Price for one'
                : 'Bei ya kipimo kimoja · Price for one (si lazima)'
            }
            testID="new-product-price"
            value={price}
            onChangeText={(text) => setPrice(text.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="2500"
            hint={
              requirePrice
                ? 'Shilingi nzima · Whole shillings.'
                : 'Shilingi nzima. Ukiiacha wazi, bidhaa itakuwa stoo lakini haitauzwa mpaka bei iwekwe · Whole shillings. Leave it blank and the item is shelved but cannot be sold until it is priced.'
            }
            editable={!busy}
          />

          <PrimaryButton
            testID="new-product-submit"
            label={busy ? 'Inahifadhi…' : 'Hifadhi na uongeze · Save and add'}
            busy={busy}
            disabled={!ready}
            onPress={submit}
          />
        </Card>

        <View style={styles.footer}>
          <SecondaryButton testID="new-product-cancel" label="Ghairi · Cancel" onPress={close} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  lede: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  mutedText: { color: colors.textMuted, fontSize: 13 },
  footer: { marginTop: spacing.sm },
});

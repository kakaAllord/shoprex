import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../app/theme';
import { Banner, PrimaryButton, SecondaryButton } from '../app/ui';

export type ScannerMode = 'product' | 'enrollment';

const MODES = {
  product: {
    title: 'Soma namba ya bidhaa',
    subtitle: 'Elekeza kamera kwenye namba ya bidhaa · Point the camera at the barcode',
    // Only the formats Shoprex actually stores.
    barcodeTypes: ['ean13', 'upc_a'] as const,
    permissionHint:
      'Shoprex inahitaji kamera kusoma namba za bidhaa. Bado unaweza kuandika jina la bidhaa · Shoprex needs the camera to read barcodes. You can still type the product name instead.',
  },
  enrollment: {
    title: 'Soma msimbo wa usajili',
    subtitle:
      'Elekeza kamera kwenye QR iliyo kwenye skrini ya mmiliki · Point the camera at the QR code on the owner’s screen',
    barcodeTypes: ['qr'] as const,
    permissionHint:
      'Shoprex inahitaji kamera kusoma QR. Bado unaweza kuandika msimbo kwa mkono · Shoprex needs the camera to read the QR code. You can still type the code by hand instead.',
  },
} as const;

/**
 * The camera, reading a code off whatever is in front of it.
 *
 * It does two jobs, and which one is decided entirely by `mode` rather than by
 * what happens to be in frame:
 *
 * - `product` — an **EAN-13 or UPC-A** off a bottle, for the sale and
 *   receiving flows. A QR in the frame is deliberately ignored: it is not a
 *   product, and reading one would only produce a 400.
 * - `enrollment` — a **QR** off the owner's screen, carrying the one-time
 *   enrollment code. A product barcode in the frame is ignored for the mirror
 *   reason: it is not an enrollment code.
 *
 * Keeping these apart matters more than it looks. A scanner that accepted
 * anything would let a bottle's barcode be submitted as an enrollment code and
 * a QR poster be submitted as a product, and both would surface as a confusing
 * refusal from the backend rather than as nothing happening — which is the
 * correct behaviour when you point a camera at the wrong thing.
 *
 * Two other details matter. The scanner **stops listening after the first
 * hit** until it is reopened — a camera pointed at a code fires the callback
 * many times a second, and without the latch one bottle would go into the cart
 * a dozen times. And a refused camera permission is a real screen with a way
 * forward, not a blank viewfinder: there is always a way to type instead,
 * which is why the sheet says so.
 *
 * ## Why this is in `src/components/`
 *
 * It used to live in `src/features/sale/`, because selling was the only thing
 * that scanned. Four features now use it — Mauzo, Pokea mzigo, Bidhaa, and
 * enrolment — and a path saying "sale" was telling three of them something
 * untrue about their own dependency. `src/components/` is for the pieces that
 * belong to no single feature, mirroring `web/src/components/`. Feature
 * folders keep what is genuinely theirs, and `src/app/ui.tsx` keeps the small
 * building blocks — buttons, cards, fields — that these are composed from.
 */
export function ScannerSheet({
  visible,
  mode = 'product',
  onScanned,
  onClose,
}: {
  visible: boolean;
  /** What this scan is for. Decides which symbologies are even listened to. */
  mode?: ScannerMode;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}) {
  const copy = MODES[mode];
  const [permission, requestPermission] = useCameraPermissions();
  // Latched on the first hit, and re-armed by `onShow` when the sheet reopens.
  const handled = useRef(false);

  const handle = (barcode: string) => {
    if (handled.current) {
      return;
    }

    handled.current = true;
    onScanned(barcode);
  };

  const close = () => {
    handled.current = false;
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onShow={() => {
        handled.current = false;
      }}
      onRequestClose={close}
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>

        <View style={styles.viewfinder}>
          {!permission ? (
            <Text style={styles.mutedText}>Inaandaa kamera… · Preparing the camera…</Text>
          ) : !permission.granted ? (
            <View style={styles.permission}>
              <Banner
                testID="scanner-permission"
                tone="warning"
                title="Kamera haijaruhusiwa · Camera not allowed"
              >
                <Text style={styles.mutedText}>{copy.permissionHint}</Text>
              </Banner>
              <PrimaryButton
                testID="scanner-request-permission"
                label="Ruhusu kamera · Allow the camera"
                onPress={() => {
                  void requestPermission();
                }}
              />
            </View>
          ) : (
            <CameraView
              testID="scanner-camera"
              style={StyleSheet.absoluteFill}
              facing="back"
              // Decided by `mode`, never by what is in frame — see the note on
              // this component.
              barcodeScannerSettings={{ barcodeTypes: [...copy.barcodeTypes] }}
              onBarcodeScanned={({ data }) => handle(data)}
            />
          )}
        </View>

        <View style={styles.footer}>
          <SecondaryButton
            testID="scanner-close"
            label="Funga · Close"
            onPress={close}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  viewfinder: {
    flex: 1,
    margin: spacing.lg,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permission: { padding: spacing.md, gap: spacing.sm, alignSelf: 'stretch' },
  mutedText: { color: colors.textMuted, fontSize: 13 },
  footer: { padding: spacing.lg, paddingTop: 0 },
});

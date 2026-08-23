import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../app/theme';
import { Banner, PrimaryButton, SecondaryButton } from '../../app/ui';

/**
 * The camera, doing exactly one job: reading an EAN-13 off a bottle.
 *
 * Two details matter more than they look. The scanner **stops listening after
 * the first hit** until it is reopened — a camera pointed at a barcode fires
 * the callback many times a second, and without the latch one bottle would go
 * into the cart a dozen times. And a refused camera permission is a real
 * screen with a way forward, not a blank viewfinder: the seller can still type
 * the product name, which is why the sheet says so.
 */
export function ScannerSheet({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}) {
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
          <Text style={styles.title}>Soma namba ya bidhaa</Text>
          <Text style={styles.subtitle}>
            Elekeza kamera kwenye namba ya bidhaa · Point the camera at the barcode
          </Text>
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
                <Text style={styles.mutedText}>
                  Shoprex inahitaji kamera kusoma namba za bidhaa. Bado unaweza
                  kuandika jina la bidhaa · Shoprex needs the camera to read
                  barcodes. You can still type the product name instead.
                </Text>
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
              // Only the format Shoprex actually stores. A QR code in the frame
              // is not a product, and reading one would only produce a 400.
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a'] }}
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

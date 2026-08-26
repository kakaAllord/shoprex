import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../app/theme';
import { Banner, BrandHeader, Card, Field, PrimaryButton, SecondaryButton } from '../../app/ui';
import { ApiClient, ShoprexApiError } from '../../core/api/apiClient';
import { ScannerSheet } from '../../components/ScannerSheet';

/**
 * The first thing a new phone shows: the one-time code the owner handed over.
 *
 * The phone chooses nothing here. It sends the code, and the backend mints the
 * `device_id` and binds this installation to one business and one **branch** —
 * doc 01 §4. Android exposes no reliable permanent hardware id, so Shoprex
 * mints its own and the app stores it.
 *
 * The phone is not enrolled to a person. Whoever works at that branch signs in
 * on it afterwards with their own password.
 *
 * **Two ways in, one code.** Somebody standing next to the owner's laptop
 * scans the QR; somebody on the phone reading a code down the line types it.
 * Both hand `enrollDevice` the identical string — the QR carries the bare code
 * and nothing else — so there is one redemption path and one set of rules, and
 * the backend cannot tell which was used. Typing stays the default because it
 * always works: no camera, no permission, no screen to point at.
 */
export function EnrollScreen({
  apiClient,
  onEnrolled,
  onCheckConnection,
}: {
  apiClient: ApiClient;
  onEnrolled: (deviceId: string) => void;
  onCheckConnection: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  /**
   * One submit path, whether the code was typed or scanned.
   *
   * The scanned value goes through exactly the same trim, the same request,
   * and the same error handling — a scan is a faster way of filling the same
   * box, not a second mechanism with its own rules.
   */
  const enrol = async (raw: string) => {
    const trimmed = raw.trim();

    if (trimmed.length < 8) {
      setError('Msimbo huu ni mfupi mno · That code is too short to be an enrolment code');

      return;
    }

    setBusy(true);
    setError(null);

    try {
      const { deviceId } = await apiClient.enrollDevice(trimmed);

      onEnrolled(deviceId);
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

  const submit = () => enrol(code);

  const onScanned = (scanned: string) => {
    setScannerOpen(false);
    // Shown in the box as well as submitted, so a failure leaves something the
    // person can see, check against the screen, and correct by hand.
    setCode(scanned.trim());
    void enrol(scanned);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader subtitle="Sajili kifaa · Enrol this phone" />

      <Text style={styles.title}>Weka namba ya usajili</Text>
      <Text style={styles.lede}>
        Mmiliki wa duka atakupa msimbo wa mara moja. Isome kwa kamera au uandike ·
        Your shop owner gives you a one-time code. Scan it, or type it below.
      </Text>

      {error ? (
        <Banner testID="enroll-error" tone="error" title="Usajili haujakamilika · Enrolment failed">
          <Text style={styles.mutedText}>{error}</Text>
        </Banner>
      ) : null}

      <Card>
        <SecondaryButton
          testID="enroll-scan"
          tone="success"
          label="Soma msimbo · Scan the QR code"
          onPress={() => {
            if (busy) {
              return;
            }

            setError(null);
            setScannerOpen(true);
          }}
        />
        <Text style={styles.scanHint}>
          Kama upo karibu na skrini ya mmiliki, isome QR · If you are next to the
          owner&apos;s screen, scan their QR code.
        </Text>

        <View style={styles.divider}>
          <Text style={styles.dividerText}>au uandike · or type it</Text>
        </View>

        <Field
          label="Namba ya usajili · Enrolment code"
          testID="enroll-code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ABCD-EFGH-JKLM"
          hint="Herufi kubwa au ndogo zote zinakubalika · Upper or lower case both work."
          editable={!busy}
        />

        <PrimaryButton
          testID="enroll-submit"
          label={busy ? 'Inasajili…' : 'Sajili kifaa · Enrol this phone'}
          busy={busy}
          disabled={code.trim().length < 8}
          onPress={submit}
        />
      </Card>

      <ScannerSheet
        visible={scannerOpen}
        mode="enrollment"
        onScanned={onScanned}
        onClose={() => setScannerOpen(false)}
      />

      <View style={styles.footer}>
        <SecondaryButton
          testID="enroll-check-connection"
          label="Angalia muunganisho · Check the connection"
          onPress={onCheckConnection}
        />
        <Text style={styles.mutedText}>
          Shoprex inahitaji mtandao. Simu hii itakuwa ya tawi lako, na kila
          mfanyakazi wa tawi ataingia kwa nenosiri lake · Shoprex needs a
          connection. This phone belongs to your branch, and everyone who works
          there signs in on it with their own password.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  lede: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  mutedText: { color: colors.textMuted, fontSize: 13 },
  footer: { gap: spacing.sm },
  scanHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  divider: { alignItems: 'center', marginVertical: spacing.md },
  dividerText: { color: colors.textMuted, fontSize: 12 },
});

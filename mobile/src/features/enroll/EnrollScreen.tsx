import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../app/theme';
import { Banner, BrandHeader, Card, Field, PrimaryButton, SecondaryButton } from '../../app/ui';
import { ApiClient, ShoprexApiError } from '../../core/api/apiClient';

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

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const { deviceId } = await apiClient.enrollDevice(code.trim());

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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader subtitle="Sajili kifaa · Enrol this phone" />

      <Text style={styles.title}>Weka namba ya usajili</Text>
      <Text style={styles.lede}>
        Mmiliki wa duka atakupa namba ya mara moja. Iandike hapa chini · Your shop
        owner gives you a one-time code. Type it below.
      </Text>

      {error ? (
        <Banner testID="enroll-error" tone="error" title="Usajili haujakamilika · Enrolment failed">
          <Text style={styles.mutedText}>{error}</Text>
        </Banner>
      ) : null}

      <Card>
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
});

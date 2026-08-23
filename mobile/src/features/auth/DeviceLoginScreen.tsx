import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../app/theme';
import {
  Banner,
  BrandHeader,
  Card,
  Empty,
  Field,
  Loading,
  PrimaryButton,
  SecondaryButton,
} from '../../app/ui';
import { ApiClient, Session, ShoprexApiError, SignInOption } from '../../core/api/apiClient';

/**
 * Signing in on a shop phone.
 *
 * The handset belongs to a **branch**, not to one person, so it cannot say who
 * is holding it — the worker says so first, then proves it. That is the whole
 * reason this screen has two steps: pick your name, then type your password.
 * It is also what makes a flat battery survivable, which is the point of the
 * change: anyone who works at this branch can pick up this phone and carry on.
 *
 * The name list carries no credential. Choosing a name grants nothing at all;
 * the password is still the only thing that does, and the backend re-checks
 * that the person really is assigned to this phone's branch.
 */
export function DeviceLoginScreen({
  apiClient,
  deviceId,
  notice,
  onSignedIn,
  onForgetDevice,
  onCheckConnection,
}: {
  apiClient: ApiClient;
  deviceId: string;
  notice?: string | null;
  onSignedIn: (session: Session) => void;
  onForgetDevice: () => void;
  onCheckConnection: () => void;
}) {
  const [people, setPeople] = useState<SignInOption[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<SignInOption | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    setListError(null);
    setPeople(null);

    try {
      setPeople(await apiClient.listSignInOptions(deviceId));
    } catch (caught) {
      setListError(
        caught instanceof ShoprexApiError
          ? caught.message
          : 'Seva haipatikani · Cannot reach the Shoprex server',
      );
      setPeople([]);
    }
  }, [apiClient, deviceId]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const submit = async () => {
    if (!chosen) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      onSignedIn(await apiClient.deviceLogin(deviceId, chosen.userId, password));
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

  const backToNames = () => {
    setChosen(null);
    setPassword('');
    setError(null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader subtitle="Ingia · Sign in" />

      {notice ? (
        <Banner testID="login-notice" tone="warning" title="Kikao kimeisha · Session ended">
          <Text style={styles.mutedText}>{notice}</Text>
        </Banner>
      ) : null}

      {chosen ? (
        <>
          <Text style={styles.title}>{chosen.fullName}</Text>
          <Text style={styles.lede}>
            Weka nenosiri lako ili kuanza kuuza · Enter your password to start selling.
          </Text>

          {error ? (
            <Banner testID="login-error" tone="error" title="Hujaingia · Not signed in">
              <Text style={styles.mutedText}>{error}</Text>
            </Banner>
          ) : null}

          <Card>
            <Field
              label="Nenosiri · Password"
              testID="login-password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />

            <PrimaryButton
              testID="login-submit"
              label={busy ? 'Inaingia…' : 'Ingia · Sign in'}
              busy={busy}
              disabled={password.length === 0}
              onPress={submit}
            />
          </Card>

          <SecondaryButton
            testID="login-change-person"
            label="Si mimi · Someone else"
            onPress={backToNames}
          />
        </>
      ) : (
        <>
          <Text style={styles.title}>Nani anaingia?</Text>
          <Text style={styles.lede}>
            Gusa jina lako · Tap your name to sign in on this phone.
          </Text>

          {listError ? (
            <Banner
              testID="login-list-error"
              tone="error"
              title="Majina hayajapatikana · Could not load names"
            >
              <Text style={styles.mutedText}>{listError}</Text>
            </Banner>
          ) : null}

          {people === null ? <Loading label="Inapakia… · Loading…" /> : null}

          {people !== null && people.length === 0 && !listError ? (
            <Empty
              title="Hakuna mtu kwenye tawi hili · Nobody works at this branch yet"
              hint="Mmiliki lazima aongeze mfanyakazi kwanza · The owner needs to add a worker first."
            />
          ) : null}

          {(people ?? []).map((person) => (
            <Pressable
              key={person.userId}
              accessibilityRole="button"
              testID={`login-person-${person.userId}`}
              onPress={() => {
                setChosen(person);
                setError(null);
              }}
              style={({ pressed }) => [styles.person, pressed && styles.personPressed]}
            >
              <Text style={styles.personName}>{person.fullName}</Text>
            </Pressable>
          ))}

          {listError ? (
            <SecondaryButton
              testID="login-retry-people"
              label="Jaribu tena · Try again"
              onPress={() => {
                void loadPeople();
              }}
            />
          ) : null}
        </>
      )}

      <View style={styles.footer}>
        <SecondaryButton
          testID="login-check-connection"
          label="Angalia muunganisho · Check the connection"
          onPress={onCheckConnection}
        />
        <SecondaryButton
          testID="login-forget-device"
          label="Sajili simu upya · Enrol this phone again"
          tone="error"
          onPress={onForgetDevice}
        />
        <Text style={styles.mutedText}>
          Kama mmiliki amefuta simu hii, omba namba mpya ya usajili · If the owner
          revoked this phone, ask them for a new enrolment code.
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
  person: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 20,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  personPressed: { backgroundColor: colors.emeraldSoft, borderColor: colors.emerald },
  personName: { fontSize: 18, fontWeight: '600', color: colors.text },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
});

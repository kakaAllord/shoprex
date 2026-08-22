import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../../app/theme';
import { ApiClient, BackendHealth, isHealthy } from '../../core/api/apiClient';

type Tone = 'neutral' | 'success' | 'warning' | 'error';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; health: BackendHealth }
  | { kind: 'error'; reason: string };

/**
 * Foundation screen: confirms the phone can reach the Shoprex backend.
 * It renders explicit loading, error, and success states, as every Shoprex
 * screen must.
 */
export function HealthScreen({ apiClient }: { apiClient: ApiClient }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const check = useCallback(async () => {
    setState({ kind: 'loading' });

    try {
      setState({ kind: 'ready', health: await apiClient.fetchHealth() });
    } catch (error) {
      setState({
        kind: 'error',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }, [apiClient]);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>D</Text>
        </View>
        <Text style={styles.brandName}>Shoprex</Text>
      </View>

      <Text style={styles.title}>Karibu Shoprex</Text>
      <Text style={styles.lede}>
        Ganda la awali. Skrini za Mauzo, Pokea mzigo na Stoo zitajengwa katika awamu
        zinazofuata.
      </Text>

      {state.kind === 'loading' ? (
        <StatusCard title="Inaunganisha... · Connecting" tone="neutral">
          <ActivityIndicator color={colors.emerald} />
        </StatusCard>
      ) : null}

      {state.kind === 'error' ? (
        <StatusCard title="Seva haipatikani · Backend unreachable" tone="error">
          <Text style={styles.muted}>Anwani · Address: {apiClient.baseUrl}</Text>
          <Text style={styles.muted}>{state.reason}</Text>
          <Text style={styles.muted}>
            Shoprex inahitaji mtandao. V1 haifanyi kazi bila muunganisho.
          </Text>
        </StatusCard>
      ) : null}

      {state.kind === 'ready' ? (
        <StatusCard
          title={
            isHealthy(state.health)
              ? 'Seva inafanya kazi · Backend healthy'
              : 'Hifadhidata haipatikani · Database down'
          }
          tone={isHealthy(state.health) ? 'success' : 'warning'}
        >
          <Row label="Huduma · Service" value={state.health.service} />
          <Row label="Toleo · Version" value={state.health.version} />
          <Row label="Mazingira · Environment" value={state.health.environment} />
          <Row label="Saa za eneo · Timezone" value={state.health.timezone} />
          <Row
            label="Hifadhidata · Database"
            value={
              state.health.databaseLatencyMs !== null
                ? `${state.health.databaseStatus} (${state.health.databaseLatencyMs} ms)`
                : state.health.databaseStatus
            }
          />
          <Row label="Anwani · Address" value={apiClient.baseUrl} />
        </StatusCard>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={check}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Angalia tena · Check again</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const TONES: Record<Tone, { background: string; foreground: string }> = {
  success: { background: colors.emeraldSoft, foreground: colors.emeraldStrong },
  warning: { background: colors.amberSoft, foreground: colors.amber },
  error: { background: colors.dangerSoft, foreground: colors.danger },
  neutral: { background: colors.surfaceMuted, foreground: colors.textMuted },
};

function StatusCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: Tone;
  children: React.ReactNode;
}) {
  const { background, foreground } = TONES[tone];

  return (
    <View style={styles.card}>
      <View style={[styles.pill, { backgroundColor: background }]}>
        <Text style={[styles.pillText, { color: foreground }]}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: colors.surface, fontWeight: '700', fontSize: 16 },
  brandName: { color: colors.emeraldStrong, fontWeight: '700', fontSize: 20 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  lede: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardBody: { marginTop: spacing.sm },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', marginBottom: spacing.xs },
  rowLabel: { width: 150, color: colors.textMuted, fontSize: 13 },
  rowValue: { flex: 1, color: colors.text, fontSize: 13 },
  muted: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs },
  button: {
    backgroundColor: colors.emerald,
    borderRadius: radius.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: colors.emeraldStrong },
  buttonText: { color: colors.surface, fontWeight: '600', fontSize: 16 },
});

import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { colors, radius, spacing } from './theme';

/**
 * The shared pieces of the Shoprex interface.
 *
 * Green-led and light-surfaced: Emerald is the main action, Kijani marks a
 * completed state, Amber warns, and red is only ever destructive or an error.
 * The selling action stays visually dominant — on every screen where selling
 * is possible, the biggest, greenest thing on it is the one that sells.
 *
 * Copy is Swahili first, English second, separated by a middle dot. Keeping
 * both in one string rather than behind a language switch is deliberate for
 * V1: the shop reads the Swahili and anyone supporting them reads the English.
 */

type Tone = 'neutral' | 'success' | 'warning' | 'error';

const TONES: Record<Tone, { background: string; foreground: string }> = {
  success: { background: colors.emeraldSoft, foreground: colors.emeraldStrong },
  warning: { background: colors.amberSoft, foreground: colors.amber },
  error: { background: colors.dangerSoft, foreground: colors.danger },
  neutral: { background: colors.surfaceMuted, foreground: colors.textMuted },
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const off = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off) }}
      testID={testID}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        pressed && !off && styles.primaryPressed,
        off && styles.primaryOff,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.surface} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  tone = 'neutral',
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
    >
      <Text
        style={[
          styles.secondaryText,
          tone === 'error' && { color: colors.danger },
          tone === 'success' && { color: colors.emeraldStrong },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Banner({
  tone,
  title,
  children,
  testID,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  testID?: string;
}) {
  const { background, foreground } = TONES[tone];

  return (
    <View testID={testID} style={[styles.banner, { backgroundColor: background }]}>
      <Text style={[styles.bannerTitle, { color: foreground }]}>{title}</Text>
      {children ? <View style={styles.bannerBody}>{children}</View> : null}
    </View>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        accessibilityLabel={label}
        {...props}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** The one thing on screen while something is being fetched. */
export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.emerald} />
      <Text style={styles.mutedCentered}>{label}</Text>
    </View>
  );
}

/** An empty state that says what to do next rather than just being blank. */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.mutedCentered}>{hint}</Text> : null}
    </View>
  );
}

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>S</Text>
      </View>
      <View>
        <Text style={styles.brandName}>Shoprex</Text>
        {subtitle ? <Text style={styles.brandSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.emerald,
    borderRadius: radius.button,
    paddingVertical: 18,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryPressed: { backgroundColor: colors.emeraldStrong },
  primaryOff: { backgroundColor: colors.border },
  primaryText: { color: colors.surface, fontWeight: '700', fontSize: 17 },
  secondary: {
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryPressed: { backgroundColor: colors.surfaceMuted },
  secondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  banner: {
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  bannerBody: { marginTop: spacing.xs },
  field: { marginBottom: spacing.md },
  fieldLabel: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs },
  fieldHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  centered: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  mutedCentered: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: colors.surface, fontWeight: '700', fontSize: 18 },
  brandName: { color: colors.emeraldStrong, fontWeight: '700', fontSize: 20 },
  brandSubtitle: { color: colors.textMuted, fontSize: 12 },
});

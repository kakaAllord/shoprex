import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../app/theme';
import { Banner, BrandHeader, Card, SecondaryButton } from '../../app/ui';
import { Profile } from '../../core/api/apiClient';

/**
 * What this person may actually do, and nothing else.
 *
 * The home screen is built from the permissions the backend returned, not from
 * a fixed list with some tiles greyed out. A worker without `SELL` is not shown
 * a dimmed Mauzo button to wonder about — they are told, in words, that selling
 * has not been granted to them and who to ask.
 *
 * Selling stays the largest, greenest thing here whatever else is granted —
 * AGENT.md's design rule. Receiving and the stock view sit under it as a pair
 * of smaller tiles, because a shop sells all day and takes a delivery once.
 *
 * Somebody granted nothing at all is told so in words, with who to ask. There
 * is no dimmed tile to poke at anywhere on this screen.
 */
export function HomeScreen({
  profile,
  onOpenSale,
  onOpenReceive,
  onOpenStock,
  onSignOut,
}: {
  profile: Profile;
  onOpenSale: () => void;
  onOpenReceive: () => void;
  onOpenStock: () => void;
  onSignOut: () => void;
}) {
  // The owner is the authority that grants these, so requiring them to grant
  // one to themselves would be a loop with no purpose. The backend's
  // PermissionsGuard takes exactly the same view.
  const isOwner = profile.role === 'OWNER';
  const maySell = profile.permissions.includes('SELL') || isOwner;
  const mayReceive = profile.permissions.includes('RECEIVE_STOCK') || isOwner;
  const mayViewStock = profile.permissions.includes('VIEW_STOCK') || isOwner;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader subtitle={profile.businessName ?? undefined} />

      <Text style={styles.greeting}>Karibu, {profile.fullName}</Text>
      <Text style={styles.lede}>Chagua unachotaka kufanya · Choose what to do.</Text>

      {maySell ? (
        <Pressable
          accessibilityRole="button"
          testID="home-open-sale"
          onPress={onOpenSale}
          style={({ pressed }) => [styles.saleTile, pressed && styles.saleTilePressed]}
        >
          <Text style={styles.saleTileTitle}>Mauzo</Text>
          <Text style={styles.saleTileSubtitle}>
            Uza haraka · Scan, search, and take payment
          </Text>
        </Pressable>
      ) : null}

      {mayReceive || mayViewStock ? (
        <View style={styles.tileRow}>
          {mayReceive ? (
            <Pressable
              accessibilityRole="button"
              testID="home-open-receive"
              onPress={onOpenReceive}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            >
              <Text style={styles.tileTitle}>Pokea mzigo</Text>
              <Text style={styles.tileSubtitle}>Receive stock</Text>
            </Pressable>
          ) : null}

          {mayViewStock ? (
            <Pressable
              accessibilityRole="button"
              testID="home-open-stock"
              onPress={onOpenStock}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            >
              <Text style={styles.tileTitle}>Stoo</Text>
              <Text style={styles.tileSubtitle}>What is on the shelf</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!maySell && !mayReceive && !mayViewStock ? (
        <Banner
          testID="home-no-permissions"
          tone="warning"
          title="Huna ruhusa bado · Nothing has been granted yet"
        >
          <Text style={styles.mutedText}>
            Mmiliki wa duka ndiye anayetoa ruhusa · Ask the shop owner to grant you
            selling, receiving, or stock viewing, then sign in again.
          </Text>
        </Banner>
      ) : null}

      {!maySell && (mayReceive || mayViewStock) ? (
        <Banner
          testID="home-no-sell"
          tone="warning"
          title="Huna ruhusa ya kuuza · Selling is not granted"
        >
          <Text style={styles.mutedText}>
            Mmiliki wa duka ndiye anayetoa ruhusa hii · Ask the shop owner to grant
            you the SELL permission, then sign in again.
          </Text>
        </Banner>
      ) : null}

      <Card>
        <Row label="Mfanyakazi · Worker" value={profile.fullName} />
        <Row label="Duka · Shop" value={profile.businessName ?? '—'} />
        <Row
          label="Ruhusa · Permissions"
          value={profile.permissions.length > 0 ? profile.permissions.join(', ') : 'Hakuna · none'}
        />
        <Row label="Kifaa · Device" value={profile.deviceId ? profile.deviceId : '—'} />
      </Card>

      <View style={styles.footer}>
        <SecondaryButton testID="home-sign-out" label="Toka · Sign out" onPress={onSignOut} />
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  greeting: { fontSize: 26, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  lede: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  // The main selling action is the largest, greenest thing on the screen, and
  // stays that way — AGENT.md's design rule.
  saleTile: {
    backgroundColor: colors.emerald,
    borderRadius: radius.card,
    padding: spacing.lg,
    minHeight: 132,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  saleTilePressed: { backgroundColor: colors.emeraldStrong },
  saleTileTitle: { color: colors.surface, fontSize: 32, fontWeight: '800' },
  saleTileSubtitle: { color: colors.emeraldSoft, fontSize: 14, marginTop: spacing.xs },
  tileRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 84,
    justifyContent: 'center',
  },
  tilePressed: { backgroundColor: colors.surfaceMuted },
  tileTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  tileSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', marginBottom: spacing.xs },
  rowLabel: { width: 150, color: colors.textMuted, fontSize: 13 },
  rowValue: { flex: 1, color: colors.text, fontSize: 13 },
  mutedText: { color: colors.textMuted, fontSize: 13 },
  footer: { marginTop: spacing.lg },
});

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../../app/theme';

/**
 * Choosing a unit, rather than spelling one.
 *
 * A seller adding a product mid-sale is standing at a counter with a customer
 * waiting. Asking them to type "Kipande" is both slow and lossy: a shop that
 * writes one unit three different ways ends up with three units that mean the
 * same thing and no way to add them together.
 *
 * So this is a search box over names the shop already uses, merged with a few
 * common Swahili ones so a shop on its first day still has something to pick.
 * Typing filters the list. Only when nothing matches — a genuinely new unit —
 * does the green **+** appear at the end of the box to add it as typed.
 */

/**
 * Enough to cover an ordinary Tanzanian duka on day one. Merged with, and
 * outranked by, whatever the shop actually uses.
 */
export const COMMON_UNIT_NAMES = [
  'Kipande',
  'Chupa',
  'Paketi',
  'Mfuko',
  'Kreti',
  'Katoni',
  'Debe',
  'Gunia',
  'Kilo',
  'Gramu',
  'Lita',
  'Mililita',
  'Dazeni',
  'Fungu',
] as const;

/** Shop names first, in the order given, then the common ones. No duplicates. */
export function mergeUnitNames(shopNames: readonly string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const name of [...shopNames, ...COMMON_UNIT_NAMES]) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();

    if (trimmed.length > 0 && !seen.has(key)) {
      seen.add(key);
      merged.push(trimmed);
    }
  }

  return merged;
}

export function matchUnitNames(names: readonly string[], query: string): string[] {
  const term = query.trim().toLowerCase();

  if (term.length === 0) {
    return [...names];
  }

  return names.filter((name) => name.toLowerCase().includes(term));
}

/**
 * Whether the typed text is a unit nobody has yet — the only case where the
 * seller should be adding one rather than choosing one.
 */
export function isNewUnitName(names: readonly string[], query: string): boolean {
  const term = query.trim().toLowerCase();

  return term.length > 0 && !names.some((name) => name.toLowerCase() === term);
}

export function UnitNameField({
  label,
  names,
  value,
  onChange,
  editable = true,
  hint,
}: {
  label: string;
  names: readonly string[];
  value: string;
  onChange: (name: string) => void;
  editable?: boolean;
  hint?: string;
}) {
  const [query, setQuery] = useState('');
  const [touched, setTouched] = useState(false);

  const matches = useMemo(() => matchUnitNames(names, query), [names, query]);
  const canAdd = isNewUnitName(names, query);

  // Before anyone touches the box, the chosen unit is what matters; after,
  // the list is what they are working with.
  const showList = touched;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel={label}
          testID="unit-search"
          style={styles.input}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setTouched(true);
          }}
          onFocus={() => setTouched(true)}
          placeholder={value || 'Tafuta kipimo · Search units'}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          editable={editable}
        />

        {canAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ongeza kipimo ${query.trim()}`}
            testID="unit-add"
            disabled={!editable}
            onPress={() => {
              onChange(query.trim());
              setQuery('');
              setTouched(false);
            }}
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          >
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
        ) : null}
      </View>

      {value ? (
        <Text testID="unit-chosen" style={styles.chosen}>
          Kipimo · Unit: <Text style={styles.chosenName}>{value}</Text>
        </Text>
      ) : null}

      {showList ? (
        <View style={styles.options}>
          {matches.length === 0 ? (
            <Text style={styles.empty}>
              Hakuna kipimo kama hicho. Gusa <Text style={styles.plus}>+</Text> kukiongeza ·
              No unit by that name — tap + to add it.
            </Text>
          ) : (
            matches.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected: name === value }}
                testID={`unit-option-${name}`}
                onPress={() => {
                  onChange(name);
                  setQuery('');
                  setTouched(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  name === value && styles.optionChosen,
                  pressed && styles.optionPressed,
                ]}
              >
                <Text style={[styles.optionText, name === value && styles.optionTextChosen]}>
                  {name}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs },
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  addButton: {
    width: 52,
    borderRadius: radius.button,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonPressed: { backgroundColor: colors.emeraldStrong },
  addButtonText: { color: colors.surface, fontSize: 26, fontWeight: '700', lineHeight: 30 },
  chosen: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  chosenName: { color: colors.emeraldStrong, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionChosen: { backgroundColor: colors.emeraldSoft, borderColor: colors.emerald },
  optionPressed: { opacity: 0.7 },
  optionText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  optionTextChosen: { color: colors.emeraldStrong },
  empty: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.xs },
  plus: { color: colors.emeraldStrong, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
});

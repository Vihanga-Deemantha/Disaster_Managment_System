import { Pressable, StyleSheet, View } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
}

/** A short list of exclusive choices, each a full-width tap target (the alert language, three options). */
export function RadioCards<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly RadioOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={legend} style={styles.group}>
      <AppText variant="label">{legend}</AppText>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.card, selected && styles.selected]}
          >
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
            <AppText variant="body" style={selected ? styles.selectedText : undefined}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  card: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
  },
  selected: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.accent600 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent600 },
  selectedText: { fontWeight: '700' },
});

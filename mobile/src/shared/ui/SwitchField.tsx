import { StyleSheet, Switch, View } from 'react-native';
import { colors, MIN_TOUCH, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';

/** A row with a label, an optional line under it, and a switch. A locked row (always on) cannot be changed. */
export function SwitchField({
  label,
  description,
  value,
  onChange,
  locked = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  locked?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="body">{label}</AppText>
        {description ? <AppText variant="caption">{description}</AppText> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={locked}
        onValueChange={onChange}
        trackColor={{ false: colors.lineStrong, true: colors.accent500 }}
        thumbColor={colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 2 },
});

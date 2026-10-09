import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';

/** A small rounded label. Colours are chosen by the caller, who also makes sure the words say the same thing. */
export function Chip({
  label,
  background,
  color,
  outline = false,
  testID,
}: {
  label: string;
  background: string;
  color: string;
  outline?: boolean;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        styles.chip,
        { backgroundColor: outline ? 'transparent' : background },
        outline && { borderColor: color, borderWidth: 1 },
      ]}
    >
      <AppText variant="caption" color={color} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    backgroundColor: colors.paper,
  },
  label: { fontWeight: '700' },
});

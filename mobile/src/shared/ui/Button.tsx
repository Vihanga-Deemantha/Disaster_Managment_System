import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  /** Shown instead of `title` while loading ("Signing in…"). */
  loadingTitle?: string;
  disabled?: boolean;
  testID?: string;
}

const LOOK: Record<ButtonVariant, { background: string; border: string; text: string }> = {
  primary: { background: colors.accent600, border: colors.accent600, text: colors.white },
  secondary: { background: colors.card, border: colors.lineStrong, text: colors.navy900 },
  ghost: { background: 'transparent', border: 'transparent', text: colors.accent600 },
  danger: { background: colors.card, border: colors.danger600, text: colors.danger600 },
};

function boxStyle(variant: ButtonVariant, pressed: boolean, inactive: boolean): ViewStyle[] {
  const { background, border } = LOOK[variant];
  return [
    styles.base,
    { backgroundColor: background, borderColor: border },
    pressed ? styles.pressed : {},
    inactive ? styles.inactive : {},
  ];
}

/** A button at least 48 points tall; while busy it says so and ignores further taps. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  loadingTitle,
  disabled = false,
  testID,
}: ButtonProps) {
  const shown = loading ? (loadingTitle ?? title) : title;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => boxStyle(variant, pressed, inactive)}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={LOOK[variant].text} /> : null}
        <AppText variant="label" color={LOOK[variant].text} style={styles.title}>
          {shown}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  title: { fontSize: 16, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.6 },
});

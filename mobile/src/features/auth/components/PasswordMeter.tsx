import { StyleSheet, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { passwordStrength, type StrengthLevel } from '../domain/passwordStrength';

const BAR: Record<StrengthLevel, string> = {
  0: colors.line,
  1: colors.danger600,
  2: colors.warning600,
  3: colors.success600,
  4: colors.success600,
};

const TEXT: Record<StrengthLevel, string> = {
  0: colors.inkSoft,
  1: colors.warning600,
  2: colors.warning600,
  3: colors.success600,
  4: colors.success600,
};

/**
 * Four bars and one sentence under the new-password box. Colour is never the only signal: the
 * sentence says the same thing, and a screen reader hears the meter's value in words.
 */
export function PasswordMeter({ password }: { password: string }) {
  const t = useT();
  const { level, messageKey } = passwordStrength(password);
  const message = t(messageKey);
  return (
    <View
      accessible
      accessibilityLabel={t('auth.register.passwordMeter')}
      accessibilityValue={{ min: 0, max: 4, now: level, text: message }}
      style={styles.wrapper}
    >
      <View style={styles.bars}>
        {([1, 2, 3, 4] as const).map((bar) => (
          <View
            key={bar}
            style={[styles.bar, { backgroundColor: bar <= level ? BAR[level] : colors.line }]}
          />
        ))}
      </View>
      <AppText variant="caption" color={TEXT[level]} accessibilityLiveRegion="polite">
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  bars: { flexDirection: 'row', gap: spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: radius.pill },
});

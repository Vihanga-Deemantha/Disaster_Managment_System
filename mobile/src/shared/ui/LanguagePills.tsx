import { Pressable, StyleSheet, View } from 'react-native';
import { LANGUAGES, type Language } from '@/shared/contracts/enums';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { colors, MIN_TOUCH, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';

/** සිංහල · தமிழ் · English: each in its own script, so a person can always find their language. */
export function LanguagePills({
  value,
  onChange,
  onDark = false,
}: {
  value: Language;
  onChange: (language: Language) => void;
  /** True on the navy header, where the unselected pills need light text. */
  onDark?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('lang.label')} style={styles.row}>
      {LANGUAGES.map((language) => {
        const selected = language === value;
        return (
          <Pressable
            key={language}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(`lang.${language}`)}
            onPress={() => onChange(language)}
            style={[
              styles.pill,
              selected ? styles.selected : onDark ? styles.onDark : styles.plain,
            ]}
          >
            <AppText
              variant="label"
              color={selected ? colors.white : onDark ? colors.navy100 : colors.navy900}
            >
              {t(`lang.${language}`)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  pill: {
    minHeight: MIN_TOUCH - 8,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.accent600, borderColor: colors.accent600 },
  plain: { backgroundColor: colors.card, borderColor: colors.lineStrong },
  onDark: { backgroundColor: 'transparent', borderColor: colors.navy600 },
});

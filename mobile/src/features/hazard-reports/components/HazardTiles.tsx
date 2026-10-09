import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { colors, MIN_TOUCH, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { REPORT_HAZARD_TYPES, type ReportHazardType } from '../domain/reportRules';

const marks = { FLOOD: '≈', LANDSLIDE: '△', ROAD_BLOCKAGE: '⊘', OTHER: '!' };
export function HazardTiles({
  value,
  onChange,
  disabled,
}: {
  value?: ReportHazardType;
  onChange: (value: ReportHazardType) => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('reports.hazard')}
      style={styles.group}
    >
      <AppText variant="heading">{t('reports.hazard')}</AppText>
      <View style={styles.grid}>
        {REPORT_HAZARD_TYPES.map((hazard) => (
          <Pressable
            key={hazard}
            accessibilityRole="radio"
            accessibilityLabel={t(`hazard.${hazard}`)}
            accessibilityState={{ selected: value === hazard, disabled }}
            disabled={disabled}
            onPress={() => onChange(hazard)}
            style={[styles.tile, value === hazard && styles.selected]}
          >
            <AppText variant="title" color={colors.accent600} accessible={false}>
              {marks[hazard]}
            </AppText>
            <AppText variant="label">{t(`hazard.${hazard}`)}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: MIN_TOUCH * 2,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.card,
  },
  selected: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
});

import { StyleSheet, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import type { MyReportChip } from '../domain/mergeMyReports';

const tones = {
  PENDING_SYNC: 'warning',
  SENDING: 'info',
  NEEDS_CHOICE: 'warning',
  NOT_SENT: 'danger',
  PENDING_REVIEW: 'info',
  VERIFIED: 'success',
  REJECTED: 'danger',
} as const;
export function StatusChip({ status }: { status: MyReportChip }) {
  const t = useT();
  const tone = tones[status];
  return (
    <View style={[styles.chip, { backgroundColor: colors[`${tone}100`] }]}>
      <AppText variant="label" color={colors[`${tone}600`]} accessibilityLiveRegion="polite">
        {t(`reports.mine.status.${status}`)}
      </AppText>
    </View>
  );
}
const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});

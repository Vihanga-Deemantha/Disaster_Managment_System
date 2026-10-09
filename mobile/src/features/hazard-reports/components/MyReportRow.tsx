import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { deviceOffsetMinutes, formatWhen } from '@/shared/i18n/formatWhen';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { MyReportItem } from '../domain/mergeMyReports';
import type { QueuedReport } from '../offline/types';
import type { useReportActions } from '../hooks/useReportActions';
import { DuplicatePrompt } from './DuplicatePrompt';
import { StatusChip } from './StatusChip';

type Actions = ReturnType<typeof useReportActions>;
function FailedActions({ report, actions }: { report: QueuedReport; actions: Actions }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  if (confirm)
    return (
      <Banner
        tone="warning"
        action={
          <View style={styles.actions}>
            <Button
              title={t('reports.mine.confirmDiscard')}
              variant="danger"
              disabled={actions.busy}
              onPress={() => void actions.discard(report.clientReportId)}
            />
            <Button
              title={t('common.cancel')}
              variant="ghost"
              disabled={actions.busy}
              onPress={() => setConfirm(false)}
            />
          </View>
        }
      >
        {t('reports.mine.discardPrompt')}
      </Banner>
    );
  return (
    <View style={styles.actions}>
      {report.photo && (
        <Button
          title={t('reports.mine.withoutPhoto')}
          variant="secondary"
          disabled={actions.busy}
          onPress={() => void actions.withoutPhoto(report.clientReportId)}
        />
      )}
      <Button
        title={t('reports.mine.discard')}
        variant="danger"
        disabled={actions.busy}
        onPress={() => setConfirm(true)}
      />
    </View>
  );
}
export function MyReportRow({
  item,
  local,
  actions,
}: {
  item: MyReportItem;
  local?: QueuedReport;
  actions: Actions;
}) {
  const t = useT();
  const now = new Date();
  return (
    <View style={styles.card} testID={`report-${item.key}`}>
      <AppText variant="heading">{t(`hazard.${item.hazardType}`)}</AppText>
      <StatusChip status={item.chip} />
      {item.description ? <AppText>{item.description}</AppText> : null}
      <AppText variant="caption">
        {formatWhen(new Date(item.capturedAt), now, t, deviceOffsetMinutes(now))}
      </AppText>
      {item.detail ? <Banner tone="warning">{item.detail}</Banner> : null}
      {local?.state === 'AWAITING_DECISION' && (
        <DuplicatePrompt
          busy={actions.busy}
          onChoice={(choice) => void actions.choice(local.clientReportId, choice)}
        />
      )}
      {local?.state === 'NEEDS_ATTENTION' && <FailedActions report={local} actions={actions} />}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  actions: { gap: spacing.sm },
});

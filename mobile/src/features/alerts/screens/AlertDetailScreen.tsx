import { useEffect, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { deviceOffsetMinutes, formatWhen } from '@/shared/i18n/formatWhen';
import { hazardLabel } from '@/shared/i18n/labels';
import { colors, radius, severityColors, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { SeverityChip } from '../components/SeverityChip';
import { ValidityChip } from '../components/ValidityChip';
import { areasLabel } from '../domain/describe';
import type { Alert } from '../domain/types';
import { validityAt } from '../domain/validity';
import { useAlertInbox } from '../hooks/AlertInboxProvider';

const HOTLINE = '117';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.fact}>
      <AppText variant="caption">{label}</AppText>
      {typeof children === 'string' ? <AppText variant="body">{children}</AppText> : children}
    </View>
  );
}

/** Where it applies, and for how long: the details the list only hints at. */
function Facts({ alert, now }: { alert: Alert; now: Date }) {
  const { t, language } = useI18n();
  const when = (iso: string): string => formatWhen(new Date(iso), now, t, deviceOffsetMinutes(now));
  return (
    <View style={styles.card}>
      <Fact label={t('alerts.detail.hazard')}>{hazardLabel(t, alert.hazardType)}</Fact>
      <Fact label={t('alerts.detail.severity')}>
        <SeverityChip severity={alert.severity} />
      </Fact>
      <Fact label={t('alerts.detail.area')}>{areasLabel(t, language, alert.areas)}</Fact>
      <Fact label={t('alerts.detail.validFrom')}>{when(alert.validFrom)}</Fact>
      <Fact label={t('alerts.detail.validTo')}>{when(alert.validTo)}</Fact>
      <Fact label={t('alerts.detail.received')}>{when(alert.deliveredAt)}</Fact>
    </View>
  );
}

/**
 * One warning in full: the whole message, where it applies and its validity period. Opening it marks it
 * read. If the alert is not on the phone (an old link, a cleared inbox) it says so and offers the way back.
 */
export function AlertDetailScreen({ alertId, onBack }: { alertId: string; onBack: () => void }) {
  const { t } = useI18n();
  const { state, markRead, serverNow } = useAlertInbox();
  const alert = state.alerts.find((candidate) => candidate.alertId === alertId);
  const found = alert !== undefined;
  const now = new Date(serverNow());

  useEffect(() => {
    if (found) markRead(alertId);
  }, [found, alertId, markRead]);

  if (!alert) {
    return (
      <View style={styles.missing}>
        <Banner tone="info">{t('alerts.detail.notFound')}</Banner>
        <Button title={t('alerts.detail.backToList')} onPress={onBack} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { borderTopColor: severityColors[alert.severity].bar }]}>
        <View style={styles.chips}>
          <SeverityChip severity={alert.severity} />
          <ValidityChip alert={alert} validity={validityAt(alert, now.getTime())} now={now} />
        </View>
        <AppText variant="title" accessibilityRole="header">
          {hazardLabel(t, alert.hazardType)}
        </AppText>
      </View>
      <View style={styles.card}>
        <AppText variant="caption">{t('alerts.detail.message')}</AppText>
        <AppText variant="body" selectable>
          {alert.message}
        </AppText>
      </View>
      <Facts alert={alert} now={now} />
      <Button
        title={t('alerts.detail.callHotline')}
        variant="secondary"
        onPress={() => void Linking.openURL(`tel:${HOTLINE}`)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.lg },
  missing: { flex: 1, padding: spacing.lg, gap: spacing.lg, backgroundColor: colors.paper },
  hero: {
    borderRadius: radius.lg,
    borderTopWidth: 6,
    backgroundColor: colors.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  fact: { gap: 2 },
});

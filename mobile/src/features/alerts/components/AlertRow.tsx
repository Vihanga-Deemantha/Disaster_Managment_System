import { Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { deviceOffsetMinutes, formatWhen } from '@/shared/i18n/formatWhen';
import { hazardLabel, severityLabel } from '@/shared/i18n/labels';
import { colors, MIN_TOUCH, radius, severityColors, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { areasLabel, validityLabel } from '../domain/describe';
import type { Alert } from '../domain/types';
import type { Validity } from '../domain/validity';
import { SeverityChip } from './SeverityChip';
import { ValidityChip } from './ValidityChip';

export interface AlertRowProps {
  alert: Alert;
  unread: boolean;
  validity: Validity;
  /** The server's idea of now, for "Today" and "Yesterday". */
  now: Date;
  onPress: (alertId: string) => void;
}

/** The sentence a screen reader reads for a row: everything the eyes get from colour, in words. */
function useRowLabel({ alert, unread, validity, now }: AlertRowProps): string {
  const { t } = useI18n();
  const offset = deviceOffsetMinutes(now);
  const label = t('alerts.rowLabel', {
    severity: severityLabel(t, alert.severity),
    hazard: hazardLabel(t, alert.hazardType),
    when: formatWhen(new Date(alert.deliveredAt), now, t, offset),
    status: validityLabel(t, alert, validity, now, offset),
  });
  return unread ? `${t('alerts.unread')}. ${label}` : label;
}

/** One warning in the list: severity chip, hazard, a line of the message, where, when, and an unread dot. */
export function AlertRow(props: AlertRowProps) {
  const { alert, unread, validity, now, onPress } = props;
  const { t, language } = useI18n();
  const spoken = useRowLabel(props);
  const when = formatWhen(new Date(alert.deliveredAt), now, t, deviceOffsetMinutes(now));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={() => onPress(alert.alertId)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`alert-row-${alert.alertId}`}
    >
      <View style={[styles.bar, { backgroundColor: severityColors[alert.severity].bar }]} />
      <View style={styles.body}>
        <View style={styles.top}>
          <AppText variant="label" style={styles.hazard}>
            {hazardLabel(t, alert.hazardType)}
          </AppText>
          <SeverityChip severity={alert.severity} />
          {unread ? <View testID="unread-dot" style={styles.dot} /> : null}
        </View>
        <AppText variant="body" numberOfLines={2}>
          {alert.message}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {`${areasLabel(t, language, alert.areas)} · ${when}`}
        </AppText>
        <ValidityChip alert={alert} validity={validity} now={now} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH * 2,
    flexDirection: 'row',
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.85 },
  bar: { width: 6 },
  body: { flex: 1, padding: spacing.md, gap: spacing.xs },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hazard: { flexShrink: 1 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 'auto',
    backgroundColor: colors.accent600,
  },
});

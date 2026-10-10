import { useI18n } from '@/shared/i18n/I18nProvider';
import { deviceOffsetMinutes } from '@/shared/i18n/formatWhen';
import { colors } from '@/shared/theme/tokens';
import { Chip } from '@/shared/ui/Chip';
import { validityLabel } from '../domain/describe';
import type { Alert } from '../domain/types';
import type { Validity } from '../domain/validity';

const LOOK: Record<Validity, { background: string; color: string; outline: boolean }> = {
  active: { background: colors.success100, color: colors.success600, outline: false },
  upcoming: { background: colors.info100, color: colors.info600, outline: false },
  expired: { background: colors.paper, color: colors.inkSoft, outline: true },
};

/** Active, starting later, or expired: the one thing a citizen needs to know about how current a warning is. */
export function ValidityChip({
  alert,
  validity,
  now,
}: {
  alert: Pick<Alert, 'validFrom'>;
  validity: Validity;
  now: Date;
}) {
  const { t } = useI18n();
  const look = LOOK[validity];
  return (
    <Chip
      testID={`validity-${validity}`}
      label={validityLabel(t, alert, validity, now, deviceOffsetMinutes(now))}
      background={look.background}
      color={look.color}
      outline={look.outline}
    />
  );
}

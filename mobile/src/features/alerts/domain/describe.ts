import type { Language } from '@/shared/contracts/enums';
import { formatWhen } from '@/shared/i18n/formatWhen';
import { districtLabel } from '@/shared/i18n/labels';
import type { Translate } from '@/shared/i18n/translate';
import type { Alert, AlertArea } from './types';
import type { Validity } from './validity';

/**
 * A place in the reader's language: a district by its Sinhala or Tamil name; a river basin exactly as
 * the DMC named it ("Kelani Ganga basin"), since a basin has no translated name to look up.
 */
export function areaLabel(t: Translate, language: Language, area: AlertArea): string {
  if (area.type === 'DISTRICT' && area.district) return districtLabel(t, language, area.district);
  return area.name;
}

export const areasLabel = (t: Translate, language: Language, areas: readonly AlertArea[]): string =>
  areas.map((area) => areaLabel(t, language, area)).join(', ');

/** "Active", "Expired", or "Starts Today, 18:00": where the alert stands against its validity period. */
export function validityLabel(
  t: Translate,
  alert: Pick<Alert, 'validFrom'>,
  validity: Validity,
  now: Date,
  offsetMinutes: number,
): string {
  if (validity === 'upcoming') {
    const time = formatWhen(new Date(alert.validFrom), now, t, offsetMinutes);
    return t('alerts.status.upcoming', { time });
  }
  return t(validity === 'active' ? 'alerts.status.active' : 'alerts.status.expired');
}

import type { District, HazardType, Language, Severity } from '@/shared/contracts/enums';
import { en } from './messages.en';
import type { Translate } from './translate';

/** "කොළඹ (Colombo)" in Sinhala and Tamil, plain "Colombo" in English, so staff can always read it too. */
export function districtLabel(t: Translate, language: Language, district: District): string {
  const native = t(`district.${district}`);
  return language === 'EN' ? native : `${native} (${en[`district.${district}`]})`;
}

/** A hazard the app does not know (a newer server) is named plainly instead of being hidden. */
export const hazardLabel = (t: Translate, hazard: HazardType | 'OTHER'): string =>
  t(`hazard.${hazard}`);

export const severityLabel = (t: Translate, severity: Severity): string =>
  t(`severity.${severity}`);

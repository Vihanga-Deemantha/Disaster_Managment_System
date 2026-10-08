import { useT } from '@/shared/i18n/I18nProvider';
import type { Band } from '../api/types';
import { bandTone } from '../model/labels';
export function BandBadge({ band }: { band: Band }) {
  const t = useT();
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${bandTone(band)}`}>
      {t(`hazardReports.band.${band}`)}
    </span>
  );
}

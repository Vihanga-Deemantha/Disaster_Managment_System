import { useT } from '@/shared/i18n/I18nProvider';
/** W1 route stub; the read-only report list is implemented in W5. */
export function CitizenReports() {
  const t = useT();
  return <h1>{t('hazardReports.mine.title')}</h1>;
}

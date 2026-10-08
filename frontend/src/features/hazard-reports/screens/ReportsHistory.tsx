import { useT } from '@/shared/i18n/I18nProvider';
/** W1 route stub; history behaviour is implemented in W5. */
export function ReportsHistory() {
  const t = useT();
  return <h1>{t('hazardReports.history.title')}</h1>;
}

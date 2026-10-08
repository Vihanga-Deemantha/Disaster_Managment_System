import { useT } from '@/shared/i18n/I18nProvider';
/** W1 route stub; queue behaviour is implemented in W2. */
export function OfficerDashboard() {
  const t = useT();
  return <h1>{t('hazardReports.dashboard.title')}</h1>;
}

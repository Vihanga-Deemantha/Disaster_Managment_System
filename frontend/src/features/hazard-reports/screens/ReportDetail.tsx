import { useT } from '@/shared/i18n/I18nProvider';
/** W1 route stub; report review is implemented in W4. */
export function ReportDetail() {
  const t = useT();
  return <h1>{t('hazardReports.report.title')}</h1>;
}

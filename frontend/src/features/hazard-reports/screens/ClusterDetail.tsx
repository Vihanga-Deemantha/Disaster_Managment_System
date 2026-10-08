import { useT } from '@/shared/i18n/I18nProvider';
/** W1 route stub; cluster behaviour is implemented in W3. */
export function ClusterDetail() {
  const t = useT();
  return <h1>{t('hazardReports.cluster.title', { area: t('hazardReports.col.area') })}</h1>;
}

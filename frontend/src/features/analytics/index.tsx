import { useT } from '@/shared/i18n/I18nProvider';
import { ModulePlaceholder } from '@/shared/layout/ModulePlaceholder';

/**
 * UC-4 Post-Event Impact Analysis. Replace this placeholder with the dashboards and report builder.
 * Handle sub-routes inside with `<Routes>`: the app mounts this component at `/analytics/*`.
 */
export function AnalyticsPage() {
  const t = useT();
  return <ModulePlaceholder title={t('nav.analytics')} />;
}

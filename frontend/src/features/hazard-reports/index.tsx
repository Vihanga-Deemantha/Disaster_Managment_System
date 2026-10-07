import { useT } from '@/shared/i18n/I18nProvider';
import { ModulePlaceholder } from '@/shared/layout/ModulePlaceholder';

/**
 * UC-3 Submit and Verify Hazard Report. Replace this placeholder with the report form and the
 * verification screens. Handle sub-routes inside with `<Routes>`: the app mounts this component at
 * `/hazard-reports/*`.
 */
export function HazardReportsPage() {
  const t = useT();
  return <ModulePlaceholder title={t('nav.hazardReports')} />;
}

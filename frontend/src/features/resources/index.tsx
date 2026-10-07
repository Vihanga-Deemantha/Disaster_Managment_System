import { useT } from '@/shared/i18n/I18nProvider';
import { ModulePlaceholder } from '@/shared/layout/ModulePlaceholder';

/**
 * UC-2 Allocate Multi-Agency Resource. Replace this placeholder with the allocation screens. Handle
 * sub-routes inside with `<Routes>`: the app mounts this component at `/resources/*`.
 */
export function ResourcesPage() {
  const t = useT();
  return <ModulePlaceholder title={t('nav.resources')} />;
}

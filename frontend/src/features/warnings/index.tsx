import { useT } from '@/shared/i18n/I18nProvider';
import { ModulePlaceholder } from '@/shared/layout/ModulePlaceholder';

/**
 * UC-1 Issue Warning. Replace this placeholder with the Pending Approvals list, the review screen,
 * the confirm dialog and the delivery summary. Handle sub-routes (`/warnings/:id`) inside with
 * `<Routes>`: the app mounts this component at `/warnings/*`.
 */
export function WarningsPage() {
  const t = useT();
  return <ModulePlaceholder title={t('nav.warnings')} />;
}

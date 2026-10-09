import { useT } from '@/shared/i18n/I18nProvider';
import { Banner } from '@/shared/ui/Banner';
import type { ConnectivityMonitor } from '../offline/ports';
import { useOnline } from '../hooks/useOnline';

export function OfflineBanner({ connectivity }: { connectivity?: ConnectivityMonitor }) {
  const t = useT();
  return useOnline(connectivity) === false ? <Banner>{t('reports.mine.offline')}</Banner> : null;
}

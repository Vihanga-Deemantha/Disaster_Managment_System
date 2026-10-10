import { useMemo } from 'react';
import { Link } from 'react-router';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { Button } from '@/shared/ui/Button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Icon } from '@/shared/ui/Icon';
import { hazardReportsApi } from '../api/hazardReportsApi';
import { AsyncState } from '../components/AsyncState';
import { DashboardStats } from '../components/DashboardStats';
import { ClusterQueue } from '../components/ClusterQueue';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export function OfficerDashboard() {
  const t = useT();
  const api = useApi();
  const client = useMemo(() => hazardReportsApi(api), [api]);
  const online = useOnlineStatus();
  const resource = useCachedResource({
    module: 'hazard-reports',
    name: 'queue',
    load: () => client.queue(),
  });
  useAutoRefresh(resource.reload, online);
  return (
    <section className="space-y-6">
      <PageHeader
        title={t('hazardReports.dashboard.title')}
        subtitle={t('hazardReports.dashboard.caption')}
      >
        <Link
          to="history"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-navy-900 transition-colors hover:bg-accent-50"
        >
          <Icon name="fileText" />
          {t('hazardReports.history.title')}
        </Link>
        <Button variant="secondary" onClick={resource.reload}>
          {t('hazardReports.dashboard.refresh')}
        </Button>
      </PageHeader>
      <AsyncState
        resource={resource}
        isEmpty={(data) => data.length === 0}
        emptyMessage={t('hazardReports.dashboard.empty')}
      >
        {(data) => (
          <>
            <DashboardStats clusters={data} />
            <ClusterQueue clusters={data} />
          </>
        )}
      </AsyncState>
    </section>
  );
}

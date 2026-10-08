import { useMemo } from 'react';
import { Link } from 'react-router';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { Button } from '@/shared/ui/Button';
import { PageHeader } from '@/shared/ui/PageHeader';
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
        <Link to="history">{t('hazardReports.history.title')}</Link>
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

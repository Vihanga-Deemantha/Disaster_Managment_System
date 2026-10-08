import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { hazardReportsApi } from '../api/hazardReportsApi';
import { AsyncState } from '../components/AsyncState';
import { ClusterContent } from '../components/ClusterContent';
import { EscalationAction } from '../components/EscalationAction';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export function ClusterDetail() {
  const { clusterId } = useParams();
  return clusterId ? <ClusterResource key={clusterId} clusterId={clusterId} /> : null;
}
function ClusterResource({ clusterId }: { clusterId: string }) {
  const t = useT();
  const api = useApi();
  const client = useMemo(() => hazardReportsApi(api), [api]);
  const online = useOnlineStatus();
  const resource = useCachedResource({
    module: 'hazard-reports',
    name: `cluster:${clusterId}`,
    load: () => client.cluster(clusterId),
  });
  useAutoRefresh(resource.reload, online);
  return (
    <section className="space-y-6">
      <AsyncState resource={resource} emptyMessage={t('hazardReports.cluster.empty')}>
        {(cluster) => (
          <>
            <ClusterContent cluster={cluster} />
            <EscalationAction
              cluster={cluster}
              client={client}
              online={online}
              reload={resource.reload}
            />
          </>
        )}
      </AsyncState>
    </section>
  );
}

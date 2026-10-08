import { useMemo } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { PageHeader } from '@/shared/ui/PageHeader';
import { hazardReportsApi } from '../api/hazardReportsApi';
import { AsyncState } from '../components/AsyncState';
import { ReviewQueueTable } from '../components/ReviewQueueTable';

/** A stable sidebar destination; each row opens the evidence for a particular pending report. */
export function ReviewReports() {
  const t = useT();
  const api = useApi();
  const client = useMemo(() => hazardReportsApi(api), [api]);
  const resource = useCachedResource({
    module: 'hazard-reports',
    name: 'history:PENDING:',
    load: () => client.history({ status: 'PENDING' }),
  });
  return (
    <section className="space-y-6">
      <PageHeader
        title={t('hazardReports.review.title')}
        subtitle={t('hazardReports.stat.pendingReports')}
      />
      <AsyncState
        resource={resource}
        isEmpty={(reports) => reports.length === 0}
        emptyMessage={t('hazardReports.review.empty')}
      >
        {(reports) => <ReviewQueueTable reports={reports} />}
      </AsyncState>
    </section>
  );
}

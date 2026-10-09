import { useMemo } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { Alert } from '@/shared/ui/Alert';
import { PageHeader } from '@/shared/ui/PageHeader';
import { hazardReportsApi } from '../api/hazardReportsApi';
import { AsyncState } from '../components/AsyncState';
import { CitizenReportList } from '../components/CitizenReportList';

export function CitizenReports() {
  const t = useT();
  const api = useApi();
  const client = useMemo(() => hazardReportsApi(api), [api]);
  const resource = useCachedResource({
    module: 'hazard-reports',
    name: 'mine',
    load: () => client.mine(),
  });
  return (
    <section className="space-y-6">
      <PageHeader title={t('hazardReports.mine.title')} />
      <Alert tone="info">{t('hazardReports.mine.useMobileApp')}</Alert>
      <AsyncState
        resource={resource}
        isEmpty={(reports) => reports.length === 0}
        emptyMessage={t('hazardReports.mine.empty')}
      >
        {(reports) => <CitizenReportList reports={reports} />}
      </AsyncState>
    </section>
  );
}

import { useMemo, useState } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { Button } from '@/shared/ui/Button';
import { SelectField, TextField } from '@/shared/ui/Field';
import { PageHeader } from '@/shared/ui/PageHeader';
import { hazardReportsApi, type HistoryFilter } from '../api/hazardReportsApi';
import type { ReportStatus } from '../api/types';
import { AsyncState } from '../components/AsyncState';
import { ReportsTable } from '../components/ReportsTable';

const STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export function ReportsHistory() {
  const t = useT();
  const [filter, setFilter] = useState<HistoryFilter>({});
  const [query, setQuery] = useState('');
  const name = `history:${filter.status ?? 'ALL'}:${filter.q ?? ''}`;
  return (
    <section className="space-y-6">
      <PageHeader title={t('hazardReports.history.title')} />
      <form
        role="search"
        className="grid items-end gap-4 rounded-2xl border border-line-soft bg-card p-5 shadow-[0_1px_2px_rgba(20,40,70,0.05)] sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,2fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter((previous) => ({ ...previous, q: query.trim() || undefined }));
        }}
      >
        <SelectField
          label={t('hazardReports.history.filterStatus')}
          value={filter.status ?? ''}
          onChange={(event) => {
            const status = (event.target.value || undefined) as ReportStatus | undefined;
            setFilter((previous) => ({ ...previous, status }));
          }}
        >
          <option value="">{t('hazardReports.history.filterAll')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`hazardReports.reportStatus.${status}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('hazardReports.history.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit">{t('hazardReports.history.searchButton')}</Button>
      </form>
      <HistoryResource key={name} name={name} filter={filter} />
    </section>
  );
}
function HistoryResource({ name, filter }: { name: string; filter: HistoryFilter }) {
  const t = useT();
  const api = useApi();
  const client = useMemo(() => hazardReportsApi(api), [api]);
  const resource = useCachedResource({
    module: 'hazard-reports',
    name,
    load: () => client.history(filter),
  });
  return (
    <AsyncState
      resource={resource}
      isEmpty={(reports) => reports.length === 0}
      emptyMessage={t('hazardReports.history.empty')}
    >
      {(reports) => <ReportsTable reports={reports} />}
    </AsyncState>
  );
}

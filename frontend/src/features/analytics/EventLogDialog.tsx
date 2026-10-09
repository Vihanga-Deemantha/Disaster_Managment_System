import { useAnalyticsText } from './i18n';
import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { useApi } from '@/shared/api/ApiProvider';
import type { AnalyticsFilter, Dataset, EventLog } from './types';
export interface LogSelection {
  dataset?: Dataset;
  day?: string;
}
/** UC-4 A3: read-only paginated event logs with the applied dashboard filter. */
export function EventLogDialog({
  filter,
  selection,
  onClose,
}: {
  filter: AnalyticsFilter;
  selection: LogSelection;
  onClose(): void;
}) {
  const tr = useAnalyticsText();
  const api = useApi();
  const [page, setPage] = useState(1);
  const [log, setLog] = useState<EventLog>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    Object.entries({ ...filter, ...selection, page: String(page) }).forEach(([key, value]) => {
      if (value !== undefined) params.set(key, value);
    });
    void api
      .get<EventLog>(`/api/analytics/event-log?${params}`)
      .then((value) => {
        if (!cancelled) setLog(value);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : tr('Unable to load event log.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, filter, selection, page]);
  return (
    <Dialog
      open
      title={`${tr('Detailed event log')}${selection.day ? ` · ${selection.day}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button
            className="uc4-secondary"
            disabled={loading || page === 1}
            onClick={() => setPage(page - 1)}
          >
            {tr('Previous')}
          </button>
          <span>
            {tr('Page')}
            {page}
          </span>
          <button
            className="uc4-secondary"
            disabled={loading || !log || page * log.pageSize >= log.total}
            onClick={() => setPage(page + 1)}
          >
            {tr('Next')}
          </button>
        </>
      }
    >
      <EventLogContent loading={loading} error={tr(error)} log={log} />
    </Dialog>
  );
}

function EventLogContent({
  loading,
  error,
  log,
}: {
  loading: boolean;
  error: string;
  log?: EventLog;
}) {
  const tr = useAnalyticsText();
  return (
    <>
      {' '}
      {loading ? (
        <p role="status">{tr('Loading event log…')}</p>
      ) : error ? (
        <p role="alert">{tr(error)}</p>
      ) : log?.rows.length ? (
        <>
          <p>
            {log.total} {tr('matching records')}
          </p>
          <div className="uc4-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{tr('Time / dataset')}</th>
                  <th>{tr('District')}</th>
                  <th>{tr('Details')}</th>
                </tr>
              </thead>
              <tbody>
                {log.rows.map((row) => (
                  <tr key={`${tr(row.dataset)}-${row.id}`}>
                    <td>
                      {row.at}
                      <small>{tr(row.dataset)}</small>
                    </td>
                    <td>{tr(row.district)}</td>
                    <td>
                      <details>
                        <summary>{row.id}</summary>
                        <pre>{JSON.stringify(row, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>{tr('No event logs for this period.')}</p>
      )}
    </>
  );
}

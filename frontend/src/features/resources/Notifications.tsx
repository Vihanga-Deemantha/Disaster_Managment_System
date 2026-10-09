import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { dateLabel, errorMessage } from './types';
import { useResourcePolling } from './liveUpdates';
interface Notice {
  notificationId: string;
  message: string;
  createdAt: string;
}
export function Notifications() {
  const api = useApi();
  const state = useCachedResource({
    module: 'resources',
    name: 'notifications',
    load: () => api.get<Notice[]>('/api/resources/notifications'),
  });
  useResourcePolling(state.reload);
  return (
    <Card>
      <h2 className="text-lg font-extrabold text-navy-900">Allocation notifications</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Requests, owner responses, arrivals and missed deadlines. Updates every 30 seconds.
      </p>
      {state.loading && (
        <p role="status" className="mt-3 text-sm">
          Checking notifications…
        </p>
      )}
      {Boolean(state.error) && <Alert tone="danger">{errorMessage(state.error)}</Alert>}
      {state.fromCache && (
        <Alert tone="warning">Saved notifications. Reconnect for new owner responses.</Alert>
      )}
      {state.data?.length === 0 && (
        <p className="mt-3 text-sm text-ink-soft">No allocation notifications yet.</p>
      )}
      <ul className="mt-3 max-h-56 space-y-3 overflow-y-auto">
        {state.data?.map((notice) => (
          <li key={notice.notificationId} className="border-t border-line-soft pt-3 text-sm">
            <p>{notice.message}</p>
            <p className="mt-1 text-xs text-ink-soft">{dateLabel(notice.createdAt)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

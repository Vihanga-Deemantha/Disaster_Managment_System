import { useApi } from '@/shared/api/ApiProvider';
import { useAuth } from '@/shared/auth/AuthContext';
import { useCachedResource, type CachedResource } from '@/shared/offline/useCachedResource';
import type { MeResponse } from '@contracts/auth';
import { LastSynced } from '@/shared/offline/LastSynced';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Alert } from '@/shared/ui/Alert';
import { RequestForm } from './RequestForm';
import { AllocationList } from './AllocationList';
import { DispatchList } from './DispatchList';
import { errorMessage, label, remaining, type Board } from './types';
export function ResourcesPage() {
  const api = useApi();
  const { user } = useAuth();
  const view = resourceView(user);
  const { title } = view;
  useDocumentTitle(title);
  const board = useCachedResource({
    module: 'resources',
    name: 'board',
    load: () => api.get<Board>('/api/resources/board'),
  });
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={view.subtitle}>
        <LastSynced syncedAt={board.syncedAt} />
        <Button variant="secondary" disabled={board.loading} onClick={board.reload}>
          Refresh
        </Button>
      </PageHeader>
      {board.loading && (
        <p role="status" className="text-sm text-ink-soft">
          Refreshing resource allocations…
        </p>
      )}
      {Boolean(board.error) && <Alert tone="danger">{errorMessage(board.error)}</Alert>}
      {board.fromCache && (
        <Alert tone="warning">
          Showing the last saved resource board. Requests and arrival confirmations can be saved for
          sync; owner responses require a fresh connection.
        </Alert>
      )}
      {board.data && <BoardContent data={board.data} state={board} mode={view.mode} />}
    </div>
  );
}
function resourceView(user: MeResponse | null) {
  if (user?.role === 'DISTRICT_OFFICER')
    return {
      mode: 'officer',
      title: 'Resource allocation',
      subtitle: `${label(user.district ?? '')} district · Coordinate relief supplies across agencies.`,
    };
  if (user?.role === 'DMC_OFFICER')
    return {
      mode: 'observer',
      title: 'Resource overview',
      subtitle: 'Monitor requests and deployments across districts.',
    };
  return {
    mode: 'owner',
    title: 'Agency allocations',
    subtitle: 'Respond to requests for your organization and follow their deployments.',
  };
}
function BoardContent({
  data,
  state,
  mode,
}: {
  data: Board;
  state: CachedResource<Board>;
  mode: string;
}) {
  const officer = mode === 'officer';
  return (
    <>
      <Summary board={data} />
      {officer && <RequestForm board={data} onSaved={state.reload} />}
      {mode !== 'owner' && <Needs board={data} />}
      <AllocationList
        board={data}
        owner={mode === 'owner'}
        fresh={!state.fromCache && !state.error && !state.loading}
        onSaved={state.reload}
      />
      <DispatchList board={data} officer={officer} onSaved={state.reload} />
    </>
  );
}
function Summary({ board }: { board: Board }) {
  const stats = [
    ['Affected areas', board.areas.length],
    ['Awaiting owner', board.requests.filter((r) => r.status === 'PENDING').length],
    ['In transit', board.dispatches.filter((d) => d.status === 'DISPATCHED').length],
    ['Arrived', board.dispatches.filter((d) => d.status === 'DEPLOYED').length],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(([name, count]) => (
        <Card key={name} className="border-t-2 border-t-accent-400">
          <p className="text-sm text-ink-soft">{name}</p>
          <p className="mt-2 text-3xl font-extrabold text-navy-900">{count}</p>
        </Card>
      ))}
    </div>
  );
}
function Needs({ board }: { board: Board }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-extrabold text-navy-900">Area requirements</h2>
      {board.areas.length === 0 && (
        <Card>No affected areas have been recorded for this district.</Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {board.areas.map((area) => (
          <Card key={area.areaId}>
            <h3 className="font-bold text-navy-900">{area.name}</h3>
            <p className="mb-4 mt-1 text-xs text-ink-soft">
              {label(area.district)} · Priority {area.priority}
            </p>
            <div className="space-y-4">
              {board.needs
                .filter((n) => n.areaId === area.areaId)
                .map((need) => (
                  <div key={need.requirementId}>
                    <div className="flex justify-between gap-3 text-sm">
                      <strong>{label(need.category)}</strong>
                      <span>
                        {need.fulfilledQty} / {need.requiredQty} {need.unit}
                      </span>
                    </div>
                    <progress
                      aria-label={`${label(need.category)} fulfilled in ${area.name}`}
                      value={need.fulfilledQty}
                      max={need.requiredQty}
                      className="mt-2 h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line-soft [&::-webkit-progress-value]:bg-accent-500 [&::-moz-progress-bar]:bg-accent-500"
                    />
                    <p className="text-xs text-ink-soft">
                      {remaining(need)} to request · {need.pendingQty} awaiting confirmation
                    </p>
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

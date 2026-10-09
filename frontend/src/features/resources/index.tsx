import { useApi } from '@/shared/api/ApiProvider';
import { useState } from 'react';
import { useInRouterContext, useLocation, useNavigate } from 'react-router';
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
import { DistrictSituation } from './DistrictSituation';
import { FieldResources } from './FieldResources';
import { useResourcePolling } from './liveUpdates';
import { Notifications } from './Notifications';
import { errorMessage, label, remaining, type Board } from './types';
export function ResourcesPage() {
  return useInRouterContext() ? <RoutedResources /> : <ResourceWorkspace />;
}
function RoutedResources() {
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split('/')[2];
  const tab = ['overview', 'allocate', 'requests', 'deployments', 'field'].includes(segment ?? '')
    ? segment
    : undefined;
  return <ResourceWorkspace routeTab={tab} onNavigate={(next) => navigate(`/resources/${next}`)} />;
}
function ResourceWorkspace({
  routeTab,
  onNavigate,
}: {
  routeTab?: string;
  onNavigate?: (tab: string) => void;
}) {
  const api = useApi();
  const { user } = useAuth();
  const view = resourceView(user);
  const title = resourceHeading(routeTab, view);
  const [selectedTab, setTab] = useState<string | null>(null);
  const [allocationArea, setAllocationArea] = useState('');
  const tab = workspaceTab(routeTab, selectedTab, view.mode);
  const selectTab = onNavigate ?? setTab;
  function allocateArea(areaId: string) {
    setAllocationArea(areaId);
    selectTab('allocate');
  }
  useDocumentTitle(title);
  const board = useCachedResource({
    module: 'resources',
    name: 'board',
    load: () => api.get<Board>('/api/resources/board'),
  });
  useResourcePolling(board.reload);
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={view.subtitle}>
        <LastSynced syncedAt={board.syncedAt} />
        <Button variant="secondary" disabled={board.loading} onClick={board.reload}>
          Refresh
        </Button>
      </PageHeader>
      <ResourceTabs mode={view.mode} selected={tab} onSelect={selectTab} />
      <DistrictOverview tab={tab} user={user} />
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
      <div id="resource-panel" role="tabpanel" aria-labelledby={`resource-tab-${tab}`}>
        {board.data && (
          <BoardContent
            data={board.data}
            state={board}
            mode={view.mode}
            tab={tab}
            areaId={allocationArea}
            onAllocate={allocateArea}
          />
        )}
      </div>
    </div>
  );
}
function workspaceTab(routeTab: string | undefined, selected: string | null, mode: string) {
  return routeTab ?? selected ?? (mode === 'owner' ? 'requests' : 'overview');
}
function resourceHeading(tab: string | undefined, view: { mode: string; title: string }) {
  switch (tab) {
    case 'overview':
      return view.mode === 'officer' ? 'District overview' : 'Resource overview';
    case 'allocate':
      return 'Allocate resources';
    case 'requests':
      return 'Requests & responses';
    case 'deployments':
      return 'Deployment tracking';
    case 'field':
      return 'Teams & shelters';
    default:
      return view.title;
  }
}
function DistrictOverview({ tab, user }: { tab: string; user: MeResponse | null }) {
  return tab === 'overview' && user?.role === 'DISTRICT_OFFICER' ? (
    <DistrictSituation district={user.district ?? ''} />
  ) : null;
}
function ResourceTabs({
  mode,
  selected,
  onSelect,
}: {
  mode: string;
  selected: string;
  onSelect: (tab: string) => void;
}) {
  const tabs = [
    ...(mode !== 'owner' ? [['overview', 'Overview']] : []),
    ...(mode === 'officer' ? [['allocate', 'Allocate']] : []),
    ['requests', 'Requests'],
    ['deployments', 'Deployments'],
    ['field', 'Teams & Shelters'],
  ];
  return (
    <div
      role="tablist"
      aria-label="Resource workspace"
      className="flex flex-wrap gap-1 rounded-xl border border-line-soft bg-white p-1.5"
    >
      {tabs.map(([id, name]) => (
        <button
          type="button"
          role="tab"
          key={id}
          id={`resource-tab-${id}`}
          aria-selected={selected === id}
          aria-controls="resource-panel"
          onClick={() => onSelect(id!)}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${selected === id ? 'bg-navy-900 text-white' : 'text-ink-soft hover:bg-paper hover:text-navy-900'}`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
function resourceView(user: MeResponse | null) {
  if (user?.role === 'DISTRICT_OFFICER')
    return {
      mode: 'officer',
      title: 'Resource allocation',
      subtitle: `${label(user.district ?? '')} district · Coordinate supplies, rescue teams and shelter places across agencies.`,
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
  tab,
  areaId,
  onAllocate,
}: {
  data: Board;
  state: CachedResource<Board>;
  mode: string;
  tab: string;
  areaId: string;
  onAllocate: (areaId: string) => void;
}) {
  const officer = mode === 'officer';
  if (tab === 'overview')
    return (
      <div className="space-y-5">
        <Summary board={data} />
        <OverviewNeeds board={data} officer={officer} onAllocate={onAllocate} />
      </div>
    );
  if (tab === 'field') return <FieldResources owner={mode === 'owner'} />;
  if (tab === 'allocate')
    return <AllocatePanel board={data} officer={officer} onSaved={state.reload} areaId={areaId} />;
  if (tab === 'requests')
    return (
      <div className="space-y-5">
        <Notifications />
        <AllocationList
          board={data}
          owner={mode === 'owner'}
          fresh={!state.fromCache && !state.error && !state.loading}
          onSaved={state.reload}
        />
      </div>
    );
  return <DispatchList board={data} officer={officer} onSaved={state.reload} />;
}
function AllocatePanel({
  board,
  officer,
  onSaved,
  areaId,
}: {
  board: Board;
  officer: boolean;
  onSaved: () => void;
  areaId: string;
}) {
  return officer ? (
    <RequestForm board={board} onSaved={onSaved} initialAreaId={areaId} />
  ) : (
    <Alert tone="warning">Only the assigned District Officer may request resources.</Alert>
  );
}
function OverviewNeeds({
  board,
  officer,
  onAllocate,
}: {
  board: Board;
  officer: boolean;
  onAllocate: (areaId: string) => void;
}) {
  return <Needs board={board} onAllocate={officer ? onAllocate : undefined} />;
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
function Needs({ board, onAllocate }: { board: Board; onAllocate?: (areaId: string) => void }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-extrabold text-navy-900">Area requirements</h2>
      {board.areas.length === 0 && (
        <Card>No affected areas have been recorded for this district.</Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {board.areas.map((area) => (
          <Card key={area.areaId}>
            <p className="mb-3 text-xs text-ink-soft">
              {
                board.needs.filter((need) => need.areaId === area.areaId && remaining(need) > 0)
                  .length
              }{' '}
              outstanding requirements
            </p>
            <details>
              <summary className="cursor-pointer font-bold text-navy-900">
                {area.name}{' '}
                <span className="ml-2 text-xs font-normal text-ink-soft">
                  Priority {area.priority} · View requirements
                </span>
              </summary>
              <p className="mb-4 mt-3 text-xs text-ink-soft">{label(area.district)} district</p>
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
            </details>
            {onAllocate && (
              <Button className="mt-4" variant="secondary" onClick={() => onAllocate(area.areaId)}>
                Allocate to this area
              </Button>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

import { useState, type ReactNode } from 'react';
import { useInRouterContext, useLocation, useNavigate } from 'react-router';
import { Activity, CheckCircle2, MapPin, RefreshCw, Truck } from 'lucide-react';
import { useApi } from '@/shared/api/ApiProvider';
import { useAuth } from '@/shared/auth/AuthContext';
import { useCachedResource, type CachedResource } from '@/shared/offline/useCachedResource';
import { LastSynced } from '@/shared/offline/LastSynced';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { Alert } from '@/shared/ui/Alert';
import { AreaRequirements } from './AreaRequirements';
import { AllocationList } from './AllocationList';
import { DispatchList } from './DispatchList';
import { DistrictSituation } from './DistrictSituation';
import { FieldResources } from './FieldResources';
import { PartnerDemoControls } from './DemoControls';
import { StockMatcher } from './StockMatcher';
import { ResourceMetrics } from './ResourceMetrics';
import { Notifications } from './Notifications';
import { useResourcePolling } from './liveUpdates';
import { errorMessage, label, type Board } from './types';

export function ResourcesPage() {
  return useInRouterContext() ? <RoutedResources /> : <ResourceWorkspace />;
}
function RoutedResources() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <ResourceWorkspace
      routeTab={location.pathname.split('/')[2]}
      onNavigate={(next) => navigate('/resources/' + next)}
    />
  );
}
function ResourceWorkspace({
  routeTab,
  onNavigate,
}: {
  routeTab?: string;
  onNavigate?: (tab: string) => void;
}) {
  const {
    board,
    officer,
    owner,
    tab,
    selectTab,
    areaId,
    setArea,
    toast,
    setToast,
    saved,
    district,
    fresh,
  } = useWorkspace(routeTab, onNavigate);
  const showTabs = workspaceUsesTabs(officer, onNavigate);
  return (
    <div className="resource-command space-y-6">
      <WorkspaceHeader
        officer={officer}
        owner={owner}
        district={district}
        refreshing={board.loading}
        onRefresh={board.reload}
      >
        <LastSynced syncedAt={board.syncedAt} />
      </WorkspaceHeader>
      {board.data && <ResourceMetrics board={board.data} />}
      <WorkspaceToast message={toast} onDismiss={() => setToast('')} />
      {showTabs && (
        <WorkspaceTabs officer={officer} owner={owner} selected={tab} onSelect={selectTab} />
      )}
      <BoardFlags board={board} />
      {board.data && (
        <div
          id="resource-panel"
          role={showTabs ? 'tabpanel' : 'region'}
          aria-label="Resource workspace content"
        >
          <WorkspaceContent
            tab={tab}
            officer={officer}
            owner={owner}
            board={board.data}
            fresh={fresh}
            district={district}
            onAllocate={setArea}
            onSaved={board.reload}
            onDeployed={() =>
              saved('Deployment confirmed. Delivered fulfillment has been updated.')
            }
          />
        </div>
      )}
      {areaId && board.data && (
        <StockMatcher
          key={areaId}
          board={board.data}
          areaId={areaId}
          onClose={() => setArea('')}
          onSaved={() =>
            saved('Allocation request saved. Track agency responses in Requests & Responses.')
          }
          onViewRequests={() => {
            setArea('');
            selectTab('requests');
          }}
        />
      )}
    </div>
  );
}
function WorkspaceHeader({
  officer,
  owner,
  district,
  refreshing,
  onRefresh,
  children,
}: {
  officer: boolean;
  owner: boolean;
  district: string;
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
          {officer
            ? 'Resource allocation'
            : owner
              ? 'Resource Owner Response Workspace'
              : 'National Resource Operations'}
        </h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-soft">
          <MapPin size={14} aria-hidden="true" />
          {officer
            ? label(district) + ' District · Emergency resource allocation'
            : 'Agency requests and operational deliveries'}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-soft">
        {children}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh resource workspace"
          className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
      </div>
    </header>
  );
}
function WorkspaceTabs({
  officer,
  owner,
  selected,
  onSelect,
}: {
  officer: boolean;
  owner: boolean;
  selected: string;
  onSelect: (tab: string) => void;
}) {
  const tabs = [
    ...(!owner ? [{ id: 'overview', name: 'Affected Areas & Needs', icon: MapPin }] : []),
    { id: 'requests', name: 'Requests & Responses', icon: Activity },
    { id: 'deployments', name: 'Dispatches & Arrivals', icon: Truck },
    ...(!officer ? [{ id: 'field', name: 'Teams & Shelters', icon: MapPin }] : []),
  ];
  return (
    <div
      role="tablist"
      aria-label="Resource workspace"
      className="flex gap-1 overflow-x-auto rounded-xl border border-line-soft bg-white p-1.5"
    >
      {tabs.map(({ id, name, icon: Icon }) => (
        <button
          type="button"
          role="tab"
          key={id}
          id={'resource-tab-' + id}
          aria-selected={selected === id}
          aria-controls="resource-panel"
          onClick={() => onSelect(id)}
          className={
            'flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ' +
            (selected === id
              ? 'bg-accent-600 text-white shadow-sm'
              : 'text-ink-soft hover:bg-paper')
          }
        >
          <Icon size={16} aria-hidden="true" />
          {name}
        </button>
      ))}
    </div>
  );
}
function WorkspaceContent({
  tab,
  officer,
  owner,
  board,
  fresh,
  district,
  onAllocate,
  onSaved,
  onDeployed,
}: {
  tab: string;
  officer: boolean;
  owner: boolean;
  board: Board;
  fresh: boolean;
  district: string;
  onAllocate: (id: string) => void;
  onSaved: () => void;
  onDeployed: () => void;
}) {
  if (tab === 'requests')
    return (
      <div className="space-y-5">
        <AllocationList board={board} owner={owner} fresh={fresh} onSaved={onSaved} />
        <details className="rounded-2xl border border-line-soft bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-navy-900">
            Operational notifications
          </summary>
          <div className="mt-4">
            <Notifications />
          </div>
        </details>
      </div>
    );
  if (tab === 'deployments')
    return (
      <DispatchList board={board} officer={officer} onSaved={onSaved} onDeployed={onDeployed} />
    );
  if (tab === 'field') return <FieldPanel officer={officer} owner={owner} />;
  return <AreaWorkspace {...{ tab, officer, owner, board, district, onAllocate }} />;
}
function AreaWorkspace({
  tab,
  officer,
  owner,
  board,
  district,
  onAllocate,
}: {
  tab: string;
  officer: boolean;
  owner: boolean;
  board: Board;
  district: string;
  onAllocate: (id: string) => void;
}) {
  if (owner)
    return <Alert tone="warning">Only the assigned District Officer can allocate resources.</Alert>;
  if (tab === 'overview' && officer)
    return <DistrictSituation district={district} board={board} onAllocate={onAllocate} />;
  return <AreaRequirements board={board} onAllocate={officer ? onAllocate : undefined} />;
}
function useWorkspace(routeTab?: string, onNavigate?: (tab: string) => void) {
  const api = useApi();
  const { user } = useAuth();
  const { officer, owner } = resourceMode(user?.role);
  const [selectedTab, setTab] = useState('');
  const [areaId, setArea] = useState('');
  const [toast, setToast] = useState('');
  const tab = workspaceTab(routeTab, selectedTab || (owner ? 'requests' : 'allocate'));
  const selectTab = onNavigate ?? setTab;
  const board = useCachedResource({
    module: 'resources',
    name: 'board',
    load: () => api.get<Board>('/api/resources/board'),
  });
  useResourcePolling(board.reload);
  useDocumentTitle(workspaceTitle(officer, owner));
  function saved(message: string) {
    setToast(message);
    board.reload();
  }
  return {
    board,
    officer,
    owner,
    tab,
    selectTab,
    areaId,
    setArea,
    toast,
    setToast,
    saved,
    district: user?.district ?? '',
    fresh: boardFresh(board),
  };
}

function resourceMode(role?: string) {
  return {
    officer: role === 'DISTRICT_OFFICER',
    owner: Boolean(role) && role !== 'DISTRICT_OFFICER' && role !== 'DMC_OFFICER',
  };
}

function workspaceTab(route: string | undefined, selected: string) {
  return ['overview', 'allocate', 'requests', 'deployments', 'field'].includes(route ?? '')
    ? route!
    : selected;
}

function workspaceTitle(officer: boolean, owner: boolean) {
  if (officer) return 'Resource allocation';
  return owner ? 'Resource Owner Response Workspace' : 'National Resource Operations';
}

function boardFresh(board: CachedResource<Board>): boolean {
  return !board.fromCache && !board.error && !board.loading;
}

function WorkspaceToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const toast = message;
  const setToast = onDismiss;
  return (
    <>
      {toast && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-accent-100 bg-accent-50 p-4 text-sm font-medium text-navy-900"
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          {toast}
          <button
            type="button"
            aria-label="Dismiss notification"
            className="ml-auto px-2"
            onClick={() => setToast()}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

function BoardFlags({ board }: { board: ReturnType<typeof useWorkspace>['board'] }) {
  return (
    <>
      {board.loading && (
        <p role="status" className="text-sm text-ink-soft">
          Refreshing resource allocations…
        </p>
      )}
      {Boolean(board.error) && <Alert tone="danger">{errorMessage(board.error)}</Alert>}
      {board.fromCache && (
        <Alert tone="warning">
          Saved resource board. Requests and arrivals can be queued offline; owner responses need a
          fresh connection.
        </Alert>
      )}
    </>
  );
}

function FieldPanel({ officer, owner }: { officer: boolean; owner: boolean }) {
  return (
    <div className="space-y-5">
      {import.meta.env.DEV && !owner && !officer && <PartnerDemoControls />}
      <FieldResources owner={owner} />
    </div>
  );
}

function workspaceUsesTabs(officer: boolean, navigate?: (tab: string) => void) {
  return !officer || !navigate;
}

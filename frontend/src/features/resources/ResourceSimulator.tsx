import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  Building2,
  FlaskConical,
  MapPin,
  PackagePlus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { DISTRICTS, type District } from '@contracts/enums';
import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { Badge, DistrictButton, EmptyState, OperationalStatus } from './ResourceUI';
import { DemoOwnerResponse } from './SimulatorResponse';
import { ResponseDeadline } from './ResponseDeadline';
import { useResourcePolling } from './liveUpdates';
import { describeAllocation, errorMessage, label, type Board, type Supply } from './types';

interface SimulatorState extends Board {
  inventory: Supply[];
}
const base = '/api/resources/dev/simulator';
const agencies = [
  { id: 'org-red-cross', name: 'Sri Lanka Red Cross', type: 'NGO' },
  { id: 'org-sl-army', name: 'Sri Lanka Army', type: 'ARMED_FORCES' },
  { id: 'org-irrigation-dept', name: 'Irrigation Department', type: 'GOVERNMENT' },
  { id: 'org-relief-foundation', name: 'Relief Foundation', type: 'PRIVATE_DONOR' },
];
const presets = [
  { title: 'Drinking water', type: 'RELIEF_SUPPLY', category: 'WATER', unit: 'packs' },
  { title: 'Food / dry rations', type: 'RELIEF_SUPPLY', category: 'DRY_RATIONS', unit: 'packs' },
  { title: 'Medical supplies', type: 'RELIEF_SUPPLY', category: 'MEDICAL', unit: 'packs' },
  { title: 'Rescue boats', type: 'RELIEF_SUPPLY', category: 'BOAT', unit: 'boats' },
  { title: 'Medical team', type: 'RESCUE_TEAM', category: 'MEDICAL', unit: 'teams' },
  { title: 'Army rescue team', type: 'RESCUE_TEAM', category: 'ARMY', unit: 'teams' },
  { title: 'Evacuation shelter', type: 'SHELTER', category: 'EVACUATION_SHELTER', unit: 'places' },
];
export function ResourceSimulator() {
  const api = useApi();
  const online = useOnlineStatus();
  const [district, setDistrict] = useState<District>('GAMPAHA');
  const [tab, setTab] = useState('inventory');
  const state = useCachedResource({
    module: 'resources',
    name: `simulator-${district}`,
    load: () => api.get<SimulatorState>(`${base}/state?district=${district}`),
  });
  useResourcePolling(state.reload);
  useDocumentTitle('SafeZone · Simulated UI');
  const disabled = !online || state.fromCache || Boolean(state.error);
  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-navy-900 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <SimulationHeader district={district} setDistrict={setDistrict} onRefresh={state.reload} />
        <div className="rounded-xl border border-accent-100 bg-accent-50 p-4 text-sm text-accent-700">
          Local development demonstration · no sign-in required. Changes are saved to the
          development dataset and appear in the District Officer workspace.
        </div>
        <SimulationTabs tab={tab} setTab={setTab} />
        {state.loading && (
          <p role="status" className="text-sm text-ink-soft">
            Refreshing simulation data…
          </p>
        )}
        {Boolean(state.error) && (
          <p role="alert" className="rounded-xl bg-danger-100 p-4 text-sm text-danger-600">
            {errorMessage(state.error)}
          </p>
        )}
        <SimulationPanels tab={tab} district={district} disabled={disabled} state={state} />
      </div>
    </main>
  );
}
function FormPanel({
  title,
  children,
  onSubmit,
  state,
  disabled,
}: {
  title: string;
  children: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  state: ReturnType<typeof useDemoMutation>;
  disabled: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-line-soft bg-white p-5 shadow-sm"
    >
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <PackagePlus size={19} className="text-accent-600" aria-hidden="true" />
        {title}
      </h2>
      <fieldset disabled={disabled || state.busy} className="space-y-4">
        {children}
        <DistrictButton type="submit" disabled={disabled || state.busy}>
          {state.busy ? 'Saving…' : 'Add to demo dataset'}
        </DistrictButton>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-danger-600">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="text-sm font-medium text-success-600">
          {state.notice}
        </p>
      )}
    </form>
  );
}
function Field({
  name,
  title,
  value,
  type = 'text',
  min,
  max,
  step = 'any',
  required = true,
}: {
  name: string;
  title: string;
  value?: string | number;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-ink-soft">
      {title}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
        step={step}
        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-900"
      />
    </label>
  );
}
function useDemoMutation(onSaved: () => void) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const keys = useRef(new Map<string, string>());
  async function send(path: string, body: object) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    const operation = path + JSON.stringify(body);
    const key = keys.current.get(operation) ?? crypto.randomUUID();
    keys.current.set(operation, key);
    try {
      await api.post(base + path, body, { idempotencyKey: key });
      setNotice('Saved. The district workspace will refresh automatically.');
      keys.current.delete(operation);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return { busy, notice, error, send };
}
function ResourceFields() {
  const [preset, setPreset] = useState(0);
  const p = presets[preset]!;
  return (
    <>
      <label className="block text-xs font-semibold text-ink-soft">
        Resource template
        <select
          aria-label="Resource template"
          value={preset}
          onChange={(e) => setPreset(Number(e.target.value))}
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-900"
        >
          {presets.map((v, i) => (
            <option key={v.title} value={i}>
              {v.title}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="resourceType" value={p.type} />
      <div key={preset} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field name="category" title="Category code" value={p.category} />
          <Field name="unit" title="Unit" value={p.unit} />
        </div>
        <Field
          name="quantity"
          title={
            p.type === 'RESCUE_TEAM' ? 'Team units (one record per team)' : 'Quantity / requirement'
          }
          type="number"
          value={p.type === 'RESCUE_TEAM' ? 1 : 100}
          min={1}
          step="1"
        />
        {p.type === 'RESCUE_TEAM' && (
          <>
            <input type="hidden" name="teamType" value={p.category} />
            <Field
              name="teamSize"
              title="Team members"
              type="number"
              value={8}
              min={1}
              max={500}
              step="1"
            />
          </>
        )}
        {p.type === 'SHELTER' && (
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="capacity"
              title="Total shelter capacity"
              type="number"
              value={100}
              min={1}
              step="1"
            />
            <Field
              name="occupancy"
              title="Current occupancy"
              type="number"
              value={0}
              min={0}
              step="1"
            />
          </div>
        )}
      </div>
    </>
  );
}
function InventoryForm({
  district,
  disabled,
  onSaved,
}: {
  district: District;
  disabled: boolean;
  onSaved: () => void;
}) {
  const state = useDemoMutation(onSaved);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    const data = new FormData(e.currentTarget);
    const agency = agencies[Number(data.get('agency'))]!;
    const type = String(data.get('resourceType'));
    void state.send('/inventory', {
      name: data.get('name'),
      district,
      resourceType: type,
      category: data.get('category'),
      unit: data.get('unit'),
      quantity: Number(data.get('quantity')),
      organizationId: agency.id,
      organizationName: agency.name,
      organizationType: agency.type,
      location: { lat: Number(data.get('lat')), lng: Number(data.get('lng')) },
      ...(type === 'RESCUE_TEAM'
        ? { teamType: data.get('teamType'), teamSize: Number(data.get('teamSize')) }
        : {}),
      ...(type === 'SHELTER'
        ? { capacity: Number(data.get('capacity')), occupancy: Number(data.get('occupancy')) }
        : {}),
    });
  }
  return (
    <FormPanel title="Add agency resource" onSubmit={submit} state={state} disabled={disabled}>
      <Field name="name" title="Resource / team / shelter name" />
      <label className="block text-xs font-semibold text-ink-soft">
        Owning agency
        <select
          name="agency"
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-900"
        >
          {agencies.map((a, i) => (
            <option key={a.id} value={i}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <ResourceFields />
      <Coordinates />
    </FormPanel>
  );
}
function Coordinates() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field name="lat" title="Latitude" type="number" value={7.08} min={-90} max={90} />
      <Field name="lng" title="Longitude" type="number" value={79.99} min={-180} max={180} />
    </div>
  );
}
function SiteForm({
  district,
  disabled,
  onSaved,
}: {
  district: District;
  disabled: boolean;
  onSaved: () => void;
}) {
  const state = useDemoMutation(onSaved);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    const data = new FormData(e.currentTarget);
    const incidentId = String(data.get('incidentId') ?? '').trim();
    void state.send('/areas', {
      name: data.get('name'),
      district,
      priority: Number(data.get('priority')),
      disasterEventId: data.get('disasterEventId'),
      hazardType: data.get('hazardType'),
      location: { lat: Number(data.get('lat')), lng: Number(data.get('lng')) },
      ...(incidentId ? { incidentId } : {}),
    });
  }
  return (
    <FormPanel title="Add affected site" onSubmit={submit} state={state} disabled={disabled}>
      <Field name="name" title="Site / area name" />
      <Field
        name="priority"
        title="Allocation rank (1 critical, 2 high)"
        type="number"
        value={1}
        min={1}
        max={10}
        step="1"
      />
      <Field name="hazardType" title="Hazard type" value="FLOOD" />
      <Field
        name="disasterEventId"
        title="Disaster event identifier"
        value={`demo-${district.toLowerCase()}-event`}
      />
      <Field
        name="incidentId"
        title="Linked incident ID (optional, from district situation)"
        required={false}
      />
      <Coordinates />
    </FormPanel>
  );
}
function RequirementForm({
  areas,
  disabled,
  onSaved,
}: {
  areas: Board['areas'];
  disabled: boolean;
  onSaved: () => void;
}) {
  const state = useDemoMutation(onSaved);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    const data = new FormData(e.currentTarget);
    void state.send('/requirements', {
      areaId: data.get('areaId'),
      resourceType: data.get('resourceType'),
      category: data.get('category'),
      unit: data.get('unit'),
      quantity: Number(data.get('quantity')),
    });
  }
  return (
    <FormPanel
      title="Add site requirement"
      onSubmit={submit}
      state={state}
      disabled={disabled || !areas.length}
    >
      <label className="block text-xs font-semibold text-ink-soft">
        Affected site
        <select
          name="areaId"
          required
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-900"
        >
          <option value="">Select a site</option>
          {areas.map((a) => (
            <option key={a.areaId} value={a.areaId}>
              {a.name} · P{a.priority}
            </option>
          ))}
        </select>
      </label>
      <ResourceFields />
      <p className="text-xs text-ink-soft">
        Use the same resource template, category code and unit as the agency stock. Add stock and
        requirements separately.
      </p>
    </FormPanel>
  );
}
function InventoryPanel({
  inventory,
  district,
  disabled,
  onSaved,
}: {
  inventory: Supply[];
  district: District;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState('');
  const items = inventory.filter(
    (i) =>
      (!i.district || i.district === district) &&
      `${i.name ?? ''} ${i.organizationName}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Agency inventory</h2>
        <Badge icon={Building2}>{items.length} resources</Badge>
      </div>
      <input
        aria-label="Search simulation inventory"
        placeholder="Search a resource or agency…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-white px-4 text-sm"
      />
      {items.map((item) => (
        <InventoryCard
          key={`${item.resourceId}:${item.currentOccupancy}:${item.status}`}
          item={item}
          disabled={disabled}
          onSaved={onSaved}
        />
      ))}
      {!items.length && (
        <EmptyState
          title="No agency resources"
          detail="Add supplies, medical teams or shelters using the form."
        />
      )}
    </section>
  );
}
function InventoryCard({
  item,
  disabled,
  onSaved,
}: {
  item: Supply;
  disabled: boolean;
  onSaved: () => void;
}) {
  const state = useDemoMutation(onSaved);
  return (
    <article className="space-y-3 rounded-2xl border border-line-soft bg-white p-5 shadow-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-bold">{item.name ?? label(item.category)}</h3>
          <p className="mt-1 text-xs text-ink-soft">
            {item.organizationName} · {label(item.resourceType ?? 'RELIEF_SUPPLY')}
          </p>
        </div>
        <Badge icon={PackagePlus}>
          {item.availableQty} {item.unit} available
        </Badge>
      </div>
      <p className="text-xs text-ink-soft">
        {item.reservedQty} reserved · Category: {item.category}
      </p>
      <ShelterEditor item={item} disabled={disabled} state={state} />
      <TeamEditor item={item} disabled={disabled} state={state} />
      <button
        type="button"
        disabled={disabled || state.busy}
        onClick={() =>
          void state.send(`/inventory/${encodeURIComponent(item.resourceId)}/refresh`, {})
        }
        className="min-h-9 text-xs font-semibold text-accent-700 disabled:opacity-50"
      >
        Refresh demo availability / partner feed
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-danger-600">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="text-xs text-success-600">
          {state.notice}
        </p>
      )}
    </article>
  );
}
function SimulatorInbox({
  board,
  disabled,
  onSaved,
}: {
  board: SimulatorState;
  disabled: boolean;
  onSaved: () => void;
}) {
  const pending = board.requests.filter((r) => r.status === 'PENDING');
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">
        Resource owner inbox · {pending.length} awaiting response
      </h2>
      <p className="text-sm text-ink-soft">
        Requests sent by the District Officer appear here. Confirm a full or partial quantity, or
        decline with a reason.
      </p>
      {board.requests
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((request) => {
          const description = describeAllocation(board, request.requirementId);
          const item = board.inventory.find((i) => i.resourceId === request.resourceId);
          return (
            <article
              key={request.requestId}
              className="rounded-2xl border border-line-soft bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-bold">
                    {description.area} · {description.category}
                  </h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    {item?.organizationName ?? request.organizationId} · {request.requestedQty}{' '}
                    {description.unit} requested
                  </p>
                </div>
                <OperationalStatus status={request.status} />
              </div>
              {request.status === 'PENDING' && (
                <>
                  <ResponseDeadline deadline={request.respondBy} />
                  <DemoOwnerResponse request={request} fresh={!disabled} local onSaved={onSaved} />
                </>
              )}
              {request.reason && <p className="mt-3 text-sm text-ink-soft">{request.reason}</p>}
            </article>
          );
        })}
      {!board.requests.length && (
        <EmptyState
          icon={MapPin}
          title="No owner requests yet"
          detail="Send a request from the District Officer workspace to begin the simulation."
        />
      )}
    </section>
  );
}

function SimulationHeader({
  district,
  setDistrict,
  onRefresh,
}: {
  district: District;
  setDistrict: (v: District) => void;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <a
          href="/resources/overview"
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-ink-soft"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          District workspace
        </a>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold">
          <FlaskConical className="text-accent-600" aria-hidden="true" />
          Simulated UI
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Set up response sites, add agency resources and test owner responses.
        </p>
      </div>
      <div className="flex gap-2">
        <select
          aria-label="Simulation district"
          value={district}
          onChange={(e) => setDistrict(e.target.value as District)}
          className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm"
        >
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {label(d)}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Refresh simulation"
          onClick={onRefresh}
          className="rounded-xl border border-line bg-white p-3"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function SimulationTabs({ tab, setTab }: { tab: string; setTab: (v: string) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Simulation tools"
      className="flex gap-1 overflow-x-auto rounded-xl border border-line-soft bg-white p-1.5"
    >
      {[
        ['inventory', 'Agency Inventory'],
        ['sites', 'Sites & Requirements'],
        ['requests', 'Owner Response Inbox'],
      ].map(([id, title]) => (
        <button
          type="button"
          role="tab"
          key={id}
          id={`sim-tab-${id}`}
          aria-controls={`sim-panel-${tab}`}
          aria-selected={tab === id}
          onClick={() => setTab(id!)}
          className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold ${tab === id ? 'bg-accent-600 text-white' : 'text-ink-soft hover:bg-paper'}`}
        >
          {title}
        </button>
      ))}
    </div>
  );
}

function SimulationPanels({
  tab,
  district,
  disabled,
  state,
}: {
  tab: string;
  district: District;
  disabled: boolean;
  state: ReturnType<typeof useCachedResource<SimulatorState>>;
}) {
  const { inventory, areas } = simulatorCollections(state.data);
  return (
    <div role="tabpanel" id={`sim-panel-${tab}`} aria-labelledby={`sim-tab-${tab}`}>
      {tab === 'inventory' && (
        <div className="grid items-start gap-6 lg:grid-cols-[360px_1fr]">
          <InventoryForm
            key={district}
            district={district}
            disabled={disabled}
            onSaved={state.reload}
          />
          <InventoryPanel
            inventory={inventory}
            district={district}
            disabled={disabled}
            onSaved={state.reload}
          />
        </div>
      )}
      {tab === 'sites' && (
        <div className="grid items-start gap-6 md:grid-cols-2">
          <SiteForm key={district} district={district} disabled={disabled} onSaved={state.reload} />
          <RequirementForm
            key={district}
            areas={areas}
            disabled={disabled}
            onSaved={state.reload}
          />
        </div>
      )}
      {tab === 'requests' && state.data && (
        <SimulatorInbox board={state.data} disabled={disabled} onSaved={state.reload} />
      )}
    </div>
  );
}

function ShelterEditor({
  item,
  disabled,
  state,
}: {
  item: Supply;
  disabled: boolean;
  state: ReturnType<typeof useDemoMutation>;
}) {
  const [occupancy, setOccupancy] = useState(String(item.currentOccupancy ?? 0));
  return (
    <>
      {item.capacity !== undefined && (
        <>
          <p className="text-sm font-medium">
            {item.currentOccupancy ?? 0} occupied / {item.capacity} capacity ·{' '}
            {item.committedQty ?? 0} committed
          </p>
          <progress
            aria-label={`Occupancy at ${item.name}`}
            value={item.currentOccupancy ?? 0}
            max={item.capacity}
            className="h-2 w-full accent-amber-500"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!disabled)
                void state.send(`/inventory/${encodeURIComponent(item.resourceId)}/occupancy`, {
                  occupancy: Number(occupancy),
                });
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-xs text-ink-soft">
              Current occupancy
              <input
                aria-label={`Simulation occupancy for ${item.name}`}
                type="number"
                min={0}
                max={item.capacity}
                step={1}
                required
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value)}
                disabled={disabled || state.busy}
                className="mt-1 block min-h-11 w-24 rounded-lg border border-line px-3 text-sm"
              />
            </label>
            <DistrictButton type="submit" disabled={disabled || state.busy}>
              Update occupancy
            </DistrictButton>
          </form>
        </>
      )}
    </>
  );
}

function TeamEditor({
  item,
  disabled,
  state,
}: {
  item: Supply;
  disabled: boolean;
  state: ReturnType<typeof useDemoMutation>;
}) {
  const [status, setStatus] = useState(item.status);
  return (
    <>
      {item.resourceType === 'RESCUE_TEAM' && (
        <>
          <p className="flex items-center gap-2 text-sm">
            <Users size={15} aria-hidden="true" />
            {item.teamSize} team members · {label(item.status)}
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={`Simulation team status for ${item.name}`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={disabled || state.busy}
              className="min-h-11 rounded-lg border border-line px-3 text-sm"
            >
              {['AVAILABLE', 'UNAVAILABLE', 'DEPLOYED'].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
            <DistrictButton
              disabled={disabled || state.busy}
              onClick={() =>
                void state.send(`/inventory/${encodeURIComponent(item.resourceId)}/team-status`, {
                  status,
                })
              }
            >
              Update team
            </DistrictButton>
          </div>
        </>
      )}
    </>
  );
}

function simulatorCollections(data?: SimulatorState) {
  return { inventory: data?.inventory ?? [], areas: data?.areas ?? [] };
}

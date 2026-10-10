import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Building2, MapPin, Package, Search, ShieldCheck, X } from 'lucide-react';
import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOfflineWrite } from '@/shared/offline/useOfflineWrite';
import { Badge, DistrictButton, EmptyState, RequirementPipeline } from './ResourceUI';
import { resourcePipeline } from './pipeline';
import { errorMessage, label, type Area, type Board, type Need, type Supply } from './types';

export function StockMatcher({
  board,
  areaId,
  onClose,
  onSaved,
  onViewRequests,
}: {
  board: Board;
  areaId: string;
  onClose: () => void;
  onSaved: () => void;
  onViewRequests?: () => void;
}) {
  const [notice, setNotice] = useState(false);
  const area = board.areas.find((a) => a.areaId === areaId);
  const panel = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = panel.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);
  if (!area) return null;
  return createPortal(
    <dialog
      ref={panel}
      aria-labelledby="stock-matcher-title"
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-2xl border-0 bg-paper p-0 text-navy-900 shadow-2xl backdrop:bg-navy-950/60"
    >
      <MatcherHeader area={area} onClose={onClose} />
      {notice && (
        <div
          role="status"
          className="mx-5 mt-4 rounded-xl border border-accent-100 bg-accent-50 p-4 text-sm text-accent-700"
        >
          Request saved. Online requests appear in the owner response tracker; offline requests wait
          for sync.
          {onViewRequests && (
            <DistrictButton className="mt-3" onClick={onViewRequests}>
              View requests · Demo Accept / Reject
            </DistrictButton>
          )}
        </div>
      )}
      <MatcherContent
        area={area}
        board={board}
        onSaved={() => {
          setNotice(true);
          onSaved();
        }}
      />
    </dialog>,
    document.body,
  );
}
function MatcherContent({
  area,
  board,
  onSaved,
}: {
  area: Area;
  board: Board;
  onSaved: () => void;
}) {
  const needs = board.needs.filter((n) => n.areaId === area.areaId);
  const [selected, setSelected] = useState(
    needs.find((n) => resourcePipeline(n, board).unallocated > 0)?.requirementId ?? '',
  );
  const need = needs.find((n) => n.requirementId === selected);
  return (
    <div className="space-y-5 p-5 sm:p-7">
      <label className="block text-sm font-semibold text-navy-900">
        Resource requirement
        <select
          aria-label="Resource requirement"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border border-line-soft bg-white px-3"
        >
          {needs.map((n) => (
            <option key={n.requirementId} value={n.requirementId}>
              {label(n.category)} · {resourcePipeline(n, board).unallocated} {n.unit} unallocated
            </option>
          ))}
        </select>
      </label>
      {need && (
        <>
          <div className="rounded-2xl border border-line-soft bg-white p-4">
            <RequirementPipeline need={need} board={board} />
          </div>
          <AgencyMatches key={need.requirementId} need={need} board={board} onSaved={onSaved} />
        </>
      )}
      {!need && (
        <EmptyState
          title="No requirements recorded"
          detail="Add this site's needs in the local simulation console."
          icon={Package}
        />
      )}
    </div>
  );
}
function AgencyMatches({
  need,
  board,
  onSaved,
}: {
  need: Need;
  board: Board;
  onSaved: () => void;
}) {
  const api = useApi();
  const stock = useCachedResource({
    module: 'resources',
    name: `stock:${need.requirementId}`,
    load: () =>
      api.get<{ resources: Supply[] }>(
        `/api/resources/requirements/${encodeURIComponent(need.requirementId)}/resources`,
      ),
  });
  const [search, setSearch] = useState('');
  const [agency, setAgency] = useState('ALL');
  const supplies = (stock.data?.resources ?? []).filter(
    (s) =>
      `${s.organizationName} ${s.name ?? ''}`.toLowerCase().includes(search.toLowerCase()) &&
      (agency === 'ALL' || s.organizationType === agency),
  );
  const maximum = resourcePipeline(need, board).unallocated;
  function saved() {
    stock.reload();
    onSaved();
  }
  return (
    <div className="space-y-4">
      <AgencyFilters search={search} setSearch={setSearch} agency={agency} setAgency={setAgency} />
      <p className="text-xs text-ink-soft">
        {supplies.length} matching inventories · sorted by straight-line distance
      </p>
      {stock.loading && (
        <p role="status" className="text-sm text-ink-soft">
          Checking agency stock…
        </p>
      )}
      {Boolean(stock.error) && (
        <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage(stock.error)}{' '}
          <button type="button" onClick={stock.reload} className="underline">
            Retry
          </button>
        </div>
      )}
      {stock.fromCache && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Saved stock levels. Requests made offline are queued; stock is rechecked during sync.
        </p>
      )}
      {!stock.loading && !supplies.length && (
        <EmptyState
          title="No matching agency stock"
          detail="Try another filter or add matching stock through the simulation console."
          icon={Building2}
        />
      )}
      {supplies.map((supply) => (
        <SupplyRequestCard
          key={`${supply.resourceId}:${maximum}:${supply.availableQty}`}
          supply={supply}
          need={need}
          maximum={maximum}
          onSaved={saved}
        />
      ))}
    </div>
  );
}
function SupplyRequestCard({
  supply,
  need,
  maximum,
  onSaved,
}: {
  supply: Supply;
  need: Need;
  maximum: number;
  onSaved: () => void;
}) {
  const state = useSupplyCard(supply, need, maximum, onSaved);
  const { enabled, error, notice } = state;
  return (
    <article className="rounded-2xl border border-line-soft bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-navy-900">{supply.organizationName}</h3>
          <p className="mt-1 text-sm text-ink-soft">{supply.name ?? label(supply.category)}</p>
        </div>
        <Badge tone="indigo" icon={Building2}>
          {label(supply.organizationType)}
        </Badge>
      </div>
      <SupplyMetadata supply={supply} />
      <AvailabilityNote supply={supply} maximum={maximum} enabled={enabled} />
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
          {notice}
        </p>
      )}
      <SupplyRequestForm supply={supply} need={need} maximum={maximum} state={state} />
    </article>
  );
}
function SupplyMetadata({ supply }: { supply: Supply }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-3 text-xs text-ink-soft">
      <p>
        <strong className="block text-lg text-navy-900">
          {supply.availableQty} <span className="text-xs font-medium">{supply.unit}</span>
        </strong>
        Available · {supply.reservedQty} reserved
      </p>
      <p className="flex items-center gap-1.5">
        <MapPin size={14} aria-hidden="true" />
        {supply.distanceKm === undefined
          ? 'Distance not recorded'
          : `${supply.distanceKm} km · estimate`}
      </p>
      {supply.capacity !== undefined && (
        <p className="col-span-2">
          Shelter capacity: {supply.capacity} · Occupied: {supply.currentOccupancy ?? 0} ·
          Committed: {supply.committedQty ?? 0}
        </p>
      )}
      {supply.teamSize !== undefined && (
        <p className="col-span-2 flex items-center gap-1.5">
          <ShieldCheck size={14} aria-hidden="true" />
          {supply.teamSize} team members
        </p>
      )}
    </div>
  );
}

function MatcherHeader({ area, onClose }: { area: Area; onClose: () => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line-soft bg-white px-5 py-5 sm:px-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent-600">
            <Building2 size={14} aria-hidden="true" />
            District allocation
          </p>
          <h2 id="stock-matcher-title" className="text-2xl font-bold">
            Multi-Agency Stock Matcher
          </h2>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
            <MapPin size={15} aria-hidden="true" />
            {area.name}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close stock matcher"
          onClick={onClose}
          className="rounded-xl p-2 text-ink-soft hover:bg-line-soft"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function AgencyFilters({
  search,
  setSearch,
  agency,
  setAgency,
}: {
  search: string;
  setSearch: (v: string) => void;
  agency: string;
  setAgency: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="flex min-w-40 flex-1 items-center gap-2 rounded-xl border border-line-soft bg-white px-3">
        <Search size={16} aria-hidden="true" className="text-ink-soft/60" />
        <input
          aria-label="Search agencies"
          placeholder="Search agencies or teams…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-11 w-full bg-transparent text-sm outline-none"
        />
      </label>
      <select
        aria-label="Agency type"
        value={agency}
        onChange={(e) => setAgency(e.target.value)}
        className="min-h-11 rounded-xl border border-line-soft bg-white px-3 text-sm"
      >
        <option value="ALL">All agencies</option>
        {['GOVERNMENT', 'ARMED_FORCES', 'NGO', 'PRIVATE_DONOR'].map((v) => (
          <option key={v} value={v}>
            {label(v)}
          </option>
        ))}
      </select>
    </div>
  );
}

function AvailabilityNote({
  supply,
  maximum,
  enabled,
}: {
  supply: Supply;
  maximum: number;
  enabled: boolean;
}) {
  return (
    <>
      {supply.availableQty < maximum && enabled && (
        <div className="mt-3">
          <Badge
            tone="amber"
            icon={Package}
            title="This agency can cover part of the gap. The rest stays unallocated."
          >
            Partial fulfillment available
          </Badge>
        </div>
      )}
      {!enabled && (
        <p className="mt-3 text-sm text-amber-800">
          {supply.status === 'UNKNOWN'
            ? 'Availability unknown · partner feed needs refreshing'
            : 'No allocation available'}
        </p>
      )}
    </>
  );
}

function useSupplyCard(supply: Supply, need: Need, maximum: number, onSaved: () => void) {
  const write = useOfflineWrite();
  const [quantity, setQuantity] = useState(String(Math.min(maximum, supply.availableQty)));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const enabled = supply.status === 'AVAILABLE' && maximum > 0 && supply.availableQty > 0;
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!enabled || busy || notice) return;
    setBusy(true);
    setError('');
    try {
      const result = await write({
        module: 'resources',
        method: 'POST',
        url: '/api/resources/allocation-requests',
        body: {
          requirementId: need.requirementId,
          resourceId: supply.resourceId,
          quantity: Number(quantity),
        },
      });
      setNotice(
        result.queued
          ? 'Request queued on this device. It will be sent when online.'
          : 'Request sent · owner response due within 30 minutes.',
      );
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return { quantity, setQuantity, busy, notice, error, enabled, send };
}

function SupplyRequestForm({
  supply,
  need,
  maximum,
  state,
}: {
  supply: Supply;
  need: Need;
  maximum: number;
  state: ReturnType<typeof useSupplyCard>;
}) {
  const { quantity, setQuantity, busy, send } = state;
  const disabled = !state.enabled || state.busy || Boolean(state.notice);
  const whole = need.resourceType === 'RESCUE_TEAM' || need.resourceType === 'SHELTER';
  return (
    <form onSubmit={(e) => void send(e)} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="min-w-24 flex-1 text-xs font-semibold text-ink-soft">
        Quantity ({need.unit})
        <input
          aria-label={`Quantity from ${supply.organizationName} ${supply.name ?? ''}`}
          type="number"
          required
          min={whole ? 1 : 0.01}
          step={whole ? 1 : 'any'}
          max={Math.min(maximum, supply.availableQty)}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={disabled}
          className="mt-1 min-h-11 w-full rounded-xl border border-line-soft px-3 text-sm text-navy-900"
        />
      </label>
      <DistrictButton type="submit" disabled={disabled}>
        <ArrowUpRight size={16} aria-hidden="true" />
        {busy ? 'Sending…' : 'Send Allocation Request'}
      </DistrictButton>
    </form>
  );
}

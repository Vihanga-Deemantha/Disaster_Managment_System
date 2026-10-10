import { useState } from 'react';
import { ArrowUpRight, ChevronDown, MapPin, Package, Search } from 'lucide-react';
import { label, type Area, type Board, type Need } from './types';
import { DistrictButton, EmptyState, PriorityBadge, RequirementPipeline } from './ResourceUI';
import { resourcePipeline } from './pipeline';

export function AreaRequirements({
  board,
  onAllocate,
}: {
  board: Board;
  onAllocate?: (areaId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('ALL');
  const areas = board.areas
    .toSorted((a, b) => a.priority - b.priority)
    .filter(
      (a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) &&
        (priority === 'ALL' || a.priority === Number(priority)),
    );
  return (
    <section className="space-y-4" aria-label="Area requirements" id="affected-area-requirements">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Affected areas & resource needs</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Compare sites and allocate where the gap is greatest.
          </p>
        </div>
        <span className="text-xs text-ink-soft">{board.areas.length} response sites</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-line-soft bg-white px-3">
          <Search size={15} className="text-ink-soft/60" aria-hidden="true" />
          <input
            aria-label="Search affected areas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a location…"
            className="min-h-10 w-full bg-transparent text-sm outline-none"
          />
        </label>
        <select
          aria-label="Area priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-line-soft bg-white px-3 text-xs"
        >
          <option value="ALL">All priorities</option>
          <option value="1">Critical · P1</option>
          <option value="2">High · P2</option>
        </select>
      </div>
      {!areas.length && (
        <EmptyState
          title="No affected areas to show"
          detail="No affected areas have been recorded for this district, or none match your filters."
        />
      )}
      <div className={'grid items-start gap-4 ' + (areas.length > 1 ? 'xl:grid-cols-2' : '')}>
        {areas.map((a) => (
          <AreaCard key={a.areaId} area={a} board={board} onAllocate={onAllocate} />
        ))}
      </div>
    </section>
  );
}
function AreaCard({
  area,
  board,
  onAllocate,
}: {
  area: Area;
  board: Board;
  onAllocate?: (areaId: string) => void;
}) {
  const needs = board.needs.filter((n) => n.areaId === area.areaId);
  const open = needs.filter((n) => resourcePipeline(n, board).unallocated > 0).length;
  return (
    <article
      id={'area-' + area.areaId}
      className="min-w-0 overflow-hidden rounded-2xl border border-line-soft bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-4">
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs text-ink-soft">
            <MapPin size={13} aria-hidden="true" />
            {label(area.district)} district{area.hazardType ? ' · ' + label(area.hazardType) : ''}
          </p>
          <h3 className="text-lg font-bold text-navy-900">{area.name}</h3>
        </div>
        <PriorityBadge priority={area.priority} />
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[510px] text-left text-xs">
          <thead className="bg-paper/60 text-ink-soft">
            <tr>
              <th className="px-4 py-2 font-medium">Resource</th>
              <th className="px-2 py-2 font-medium">Required</th>
              <th className="px-2 py-2 font-medium">Unallocated</th>
              <th className="px-2 py-2 font-medium">Awaiting</th>
              <th className="px-2 py-2 font-medium">In transit</th>
              <th className="px-3 py-2 font-medium">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {needs.map((need) => (
              <RequirementRow key={need.requirementId} need={need} board={board} />
            ))}
          </tbody>
        </table>
      </div>
      {!needs.length && (
        <p className="px-4 py-5 text-sm text-ink-soft">
          Requirements have not been recorded for this site.
        </p>
      )}
      {onAllocate && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3">
          <p className="text-xs text-ink-soft">
            {open} unallocated requirement{open === 1 ? '' : 's'}
          </p>
          <DistrictButton disabled={!open} onClick={() => onAllocate(area.areaId)}>
            <ArrowUpRight size={15} aria-hidden="true" />
            {open ? 'Allocate Resources' : 'All requirements allocated'}
          </DistrictButton>
        </footer>
      )}
    </article>
  );
}
function RequirementRow({ need, board }: { need: Need; board: Board }) {
  const [expanded, setExpanded] = useState(false);
  const p = resourcePipeline(need, board);
  return (
    <>
      <tr className="border-t border-line-soft">
        <th scope="row" className="px-4 py-3 font-medium">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={'Pipeline details for ' + label(need.category)}
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-navy-900"
          >
            <Package size={13} className="text-accent-500" aria-hidden="true" />
            {label(need.category)}
            <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} aria-hidden="true" />
          </button>
          <span className="mt-1 block text-[10px] font-normal text-ink-soft">{need.unit}</span>
        </th>
        <td className="px-2 py-3 font-bold tabular-nums">{p.required}</td>
        <td
          className={
            'px-2 py-3 font-bold tabular-nums ' +
            (p.unallocated ? 'text-rose-700' : 'text-ink-soft')
          }
        >
          {p.unallocated}
        </td>
        <td className="px-2 py-3 tabular-nums text-amber-800">{p.awaitingOwner}</td>
        <td className="px-2 py-3 tabular-nums text-amber-800">{p.inTransit}</td>
        <td className="px-3 py-3 font-semibold tabular-nums text-emerald-700">{p.delivered}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="border-t border-line-soft bg-paper/40 px-4 py-4">
            <RequirementPipeline need={need} board={board} />
          </td>
        </tr>
      )}
    </>
  );
}

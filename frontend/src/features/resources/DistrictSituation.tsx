import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource, type CachedResource } from '@/shared/offline/useCachedResource';
import { LastSynced } from '@/shared/offline/LastSynced';
import { Card } from '@/shared/ui/Card';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { MapPin, Waves, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { Badge, DistrictButton } from './ResourceUI';
import { useState } from 'react';
import { useResourcePolling } from './liveUpdates';
import { dateLabel, errorMessage, label, type Board } from './types';

interface Issue {
  id: string;
  dominantHazardType: string;
  band: string;
  status: string;
  priorityScore: number;
  counts: { total: number; pending: number; verified: number; rejected: number };
  lastReportAt: string;
  centroid: { lat: number; lng: number };
  locationName?: string;
  areaId?: string;
}
interface Warning {
  warningId: string;
  hazardType: string;
  severity: string;
  targetAreas: { areaId: string; name: string }[];
  messages: { EN: string };
  validTo: string;
}

export function DistrictSituation({
  district,
  board,
  onAllocate,
}: {
  district: string;
  board?: Board;
  onAllocate?: (areaId: string) => void;
}) {
  const api = useApi();
  const issues = useCachedResource({
    module: 'resources',
    name: 'district-issues',
    load: () => api.get<Issue[]>('/api/hazard-reports/district/situation'),
  });
  const warnings = useCachedResource({
    module: 'resources',
    name: 'district-warnings',
    load: () => api.get<Warning[]>('/api/warnings/district/situation'),
  });
  useResourcePolling(issues.reload);
  useResourcePolling(warnings.reload);
  return (
    <section className="space-y-4" aria-label="District situation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">
            {label(district)} district situation
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Reported incidents and currently valid official warnings.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={issues.loading || warnings.loading}
          onClick={() => {
            issues.reload();
            warnings.reload();
          }}
        >
          Refresh situation
        </Button>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="font-bold text-navy-900">District issues</h3>
          <FeedStatus state={issues} />
          {issues.data && (
            <IssueList
              issues={issues.data}
              district={district}
              board={board}
              onAllocate={onAllocate}
            />
          )}
        </Card>
        <Card>
          <h3 className="font-bold text-navy-900">Active warnings</h3>
          <FeedStatus state={warnings} />
          {warnings.data && <WarningList warnings={warnings.data} />}
        </Card>
      </div>
    </section>
  );
}
function FeedStatus<T>({ state }: { state: CachedResource<T> }) {
  return (
    <div className="my-3 space-y-2 text-sm text-ink-soft">
      <LastSynced syncedAt={state.syncedAt} />
      {state.loading && <p role="status">Updating district situation…</p>}
      {Boolean(state.error) && (
        <Alert tone="danger">
          {errorMessage(state.error)}
          <Button variant="ghost" onClick={state.reload}>
            Retry situation feed
          </Button>
        </Alert>
      )}
      {state.fromCache && (
        <Alert tone="warning">
          Saved situation data. Warning validity and incident status may have changed; reconnect to
          refresh.
        </Alert>
      )}
    </div>
  );
}
function IssueList({
  issues,
  district,
  board,
  onAllocate,
}: {
  issues: Issue[];
  district: string;
  board?: Board;
  onAllocate?: (areaId: string) => void;
}) {
  const totals = issues.reduce(
    (sum, issue) => ({
      pending: sum.pending + issue.counts.pending,
      verified: sum.verified + issue.counts.verified,
    }),
    { pending: 0, verified: 0 },
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        {issues.length} open incident groups · {totals.pending} reports awaiting verification ·{' '}
        {totals.verified} verified
      </p>
      {issues.length === 0 && (
        <p className="text-sm">
          No open incident groups recorded. This does not confirm the district is safe.
        </p>
      )}
      {issues.map((issue) => (
        <IncidentCard
          key={issue.id}
          issue={issue}
          district={district}
          board={board}
          onAllocate={onAllocate}
        />
      ))}
    </div>
  );
}
function IncidentCard({
  issue,
  district,
  board,
  onAllocate,
}: {
  issue: Issue;
  district: string;
  board?: Board;
  onAllocate?: (areaId: string) => void;
}) {
  const mapped = board?.areas.find(
    (area) => area.incidentId === issue.id || area.areaId === issue.areaId,
  );
  const coordinates = issue.centroid
    ? `${issue.centroid.lat.toFixed(4)}, ${issue.centroid.lng.toFixed(4)}`
    : 'Coordinates not recorded';
  const location =
    mapped?.name ?? issue.locationName ?? `${label(district)} incident · ${issue.id.slice(-8)}`;
  return (
    <article className="space-y-3 rounded-xl border border-line-soft bg-paper/50 p-4">
      <h4 className="flex items-center gap-2 text-base font-bold text-navy-900">
        <MapPin size={17} className="text-accent-600" aria-hidden="true" />
        {location}
      </h4>
      <p className="text-xs text-ink-soft">
        Incident {issue.id} · {coordinates}
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge tone="indigo" icon={Waves}>
          {label(issue.dominantHazardType)}
        </Badge>
        <Badge tone={issue.band === 'CRITICAL' ? 'rose' : 'amber'} icon={AlertTriangle}>
          {label(issue.band)} reported priority · {issue.priorityScore}
        </Badge>
      </div>
      <p className="text-xs text-ink-soft">
        {label(issue.status)} · {issue.counts.pending} pending · {issue.counts.verified} verified ·{' '}
        {issue.counts.rejected} rejected
      </p>
      <p className="text-xs text-ink-soft">Last report {dateLabel(issue.lastReportAt)}</p>
      <IncidentAllocation
        issueId={issue.id}
        mappedId={mapped?.areaId}
        board={board}
        onAllocate={onAllocate}
      />
    </article>
  );
}
function WarningList({ warnings }: { warnings: Warning[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">{warnings.length} active official warnings</p>
      {warnings.length === 0 && (
        <p className="text-sm">
          No currently valid issued warnings recorded. Check district reports before making response
          decisions.
        </p>
      )}
      {warnings.map((warning) => (
        <article
          key={warning.warningId}
          className="rounded-xl border border-accent-200 bg-paper p-4"
        >
          <strong>
            {label(warning.hazardType)} · {label(warning.severity)}
          </strong>
          <div className="mt-2">
            <Badge tone={warning.severity === 'CRITICAL' ? 'rose' : 'amber'} icon={AlertTriangle}>
              {label(warning.severity)} official warning
            </Badge>
          </div>
          <p className="mt-2 text-sm">{warning.messages.EN}</p>
          <p className="mt-2 text-xs text-ink-soft">
            {warning.targetAreas.map((area) => area.name).join(', ')} · Valid until{' '}
            {dateLabel(warning.validTo)}
          </p>
        </article>
      ))}
    </div>
  );
}

function IncidentAllocation({
  issueId,
  mappedId,
  board,
  onAllocate,
}: {
  issueId: string;
  mappedId?: string;
  board?: Board;
  onAllocate?: (id: string) => void;
}) {
  const [chosen, setChosen] = useState('');
  const areaId = mappedId ?? chosen;
  if (!onAllocate) return null;
  return (
    <>
      {!mappedId && (
        <label className="block text-xs text-ink-soft">
          No linked allocation site. Choose the correct affected area:
          <select
            aria-label={`Allocation site for ${issueId}`}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-line-soft bg-white px-2 text-sm"
          >
            <option value="">Select an allocation site</option>
            {board?.areas.map((area) => (
              <option key={area.areaId} value={area.areaId}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <DistrictButton disabled={!areaId} onClick={() => onAllocate(areaId)}>
        <ArrowUpRight size={15} aria-hidden="true" />
        View & Allocate Requirements
      </DistrictButton>
    </>
  );
}

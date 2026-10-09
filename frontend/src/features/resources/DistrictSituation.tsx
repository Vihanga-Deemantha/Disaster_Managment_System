import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource, type CachedResource } from '@/shared/offline/useCachedResource';
import { LastSynced } from '@/shared/offline/LastSynced';
import { Card } from '@/shared/ui/Card';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { dateLabel, errorMessage, label } from './types';

interface Issue {
  id: string;
  dominantHazardType: string;
  band: string;
  status: string;
  priorityScore: number;
  counts: { total: number; pending: number; verified: number; rejected: number };
  lastReportAt: string;
  centroid: { lat: number; lng: number };
}
interface Warning {
  warningId: string;
  hazardType: string;
  severity: string;
  targetAreas: { areaId: string; name: string }[];
  messages: { EN: string };
  validTo: string;
}

export function DistrictSituation({ district }: { district: string }) {
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
          {issues.data && <IssueList issues={issues.data} />}
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
function IssueList({ issues }: { issues: Issue[] }) {
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
        <article key={issue.id} className="rounded-xl border border-line-soft p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{label(issue.dominantHazardType)}</strong>
            <span className="text-sm font-semibold text-accent-700">
              {label(issue.band)} reported priority · {issue.priorityScore}
            </span>
          </div>
          <p className="mt-2 text-sm">
            {label(issue.status)} · {issue.counts.pending} pending · {issue.counts.verified}{' '}
            verified · {issue.counts.rejected} rejected
          </p>
          <p className="mt-1 text-xs text-ink-soft">Last report {dateLabel(issue.lastReportAt)}</p>
        </article>
      ))}
    </div>
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

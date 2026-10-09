import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { LastSynced } from '@/shared/offline/LastSynced';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Alert } from '@/shared/ui/Alert';
import { ResourceUpdate } from './ResourceUpdate';
import { dateLabel, errorMessage, label, type Supply } from './types';

export function FieldResources({ owner }: { owner: boolean }) {
  const api = useApi();
  const state = useCachedResource({
    module: 'resources',
    name: 'field-inventory',
    load: () => api.get<Supply[]>('/api/resources/inventory'),
  });
  const items = state.data?.filter(
    (item) => item.resourceType === 'RESCUE_TEAM' || item.resourceType === 'SHELTER',
  );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold text-navy-900">Rescue teams & shelters</h2>
        <Button variant="secondary" onClick={state.reload} disabled={state.loading}>
          Refresh field resources
        </Button>
      </div>
      <LastSynced syncedAt={state.syncedAt} />
      {state.loading && (
        <p role="status" className="text-sm text-ink-soft">
          Updating teams and shelters…
        </p>
      )}
      {Boolean(state.error) && <Alert tone="danger">{errorMessage(state.error)}</Alert>}
      {state.fromCache && (
        <Alert tone="warning">
          Saved team availability and shelter occupancy. Refresh online before coordinating a
          response.
        </Alert>
      )}
      {items?.length === 0 && (
        <Card>No rescue teams or shelters have been registered for this view.</Card>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {items?.map((item) => (
          <Card key={item.resourceId}>
            <h3 className="font-bold text-navy-900">{item.name ?? label(item.category)}</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {item.organizationName} · {label(item.organizationType)}
            </p>
            <ResourceDetails item={item} />
            {owner && (
              <ResourceUpdate
                key={`${item.resourceId}:${item.lastSyncedAt}`}
                item={item}
                fresh={!state.fromCache && !state.error && !state.loading}
                onSaved={state.reload}
              />
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
function ResourceDetails({ item }: { item: Supply }) {
  return (
    <div className="my-4 space-y-2 text-sm">
      <p className="font-semibold">
        {label(item.status)} · {item.availableQty} {item.unit} available · {item.reservedQty}{' '}
        reserved
      </p>
      {item.resourceType === 'RESCUE_TEAM' ? (
        <>
          <p>
            {item.teamSize} team members ·{' '}
            {item.availableQty > 0 ? 'Ready for allocation' : 'Assigned or unavailable'}
          </p>
          {item.lastUpdatedAt && (
            <p className="text-xs text-ink-soft">Status updated {dateLabel(item.lastUpdatedAt)}</p>
          )}
        </>
      ) : (
        <>
          <p>
            {label(item.district ?? '')} district · {item.currentOccupancy} / {item.capacity} places
            occupied
          </p>
          <p>{item.committedQty} confirmed places awaiting arrival</p>
          <progress
            aria-label={`Occupancy at ${item.name}`}
            value={item.currentOccupancy}
            max={item.capacity}
            className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line-soft [&::-webkit-progress-value]:bg-accent-500 [&::-moz-progress-bar]:bg-accent-500"
          />
        </>
      )}
    </div>
  );
}

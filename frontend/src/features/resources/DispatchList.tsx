import { useState } from 'react';
import { useOfflineWrite } from '@/shared/offline/useOfflineWrite';
import { Card } from '@/shared/ui/Card';
import { Alert } from '@/shared/ui/Alert';
import { StatusBadge } from './AllocationList';
import { DispatchActions } from './DispatchActions';
import { Badge, DistrictButton, EmptyState } from './ResourceUI';
import { PackageCheck, Truck, Users, ArrowRight } from 'lucide-react';
import { describeAllocation, dateLabel, errorMessage, type Board, type Dispatch } from './types';
export function DispatchList({
  board,
  officer,
  onSaved,
  onDeployed,
}: {
  board: Board;
  officer: boolean;
  onSaved: () => void;
  onDeployed?: () => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-extrabold text-navy-900">Dispatches & arrivals</h2>
      {board.dispatches.length === 0 && (
        <EmptyState
          icon={Truck}
          title="No active deliveries"
          detail="Dispatches appear here after an owner confirms an allocation."
        />
      )}
      {board.dispatches.map((dispatch) => (
        <DispatchCard
          key={dispatch.dispatchId}
          {...{ board, dispatch, officer, onSaved, onDeployed }}
        />
      ))}
    </section>
  );
}
function DispatchCard({
  board,
  dispatch,
  officer,
  onSaved,
  onDeployed,
}: {
  board: Board;
  dispatch: Dispatch;
  officer: boolean;
  onSaved: () => void;
  onDeployed?: () => void;
}) {
  const write = useOfflineWrite();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const description = describeAllocation(board, dispatch.requirementId);
  async function arrive() {
    setBusy(true);
    setError('');
    try {
      const result = await write({
        module: 'resources',
        method: 'POST',
        url: `/api/resources/dispatches/${encodeURIComponent(dispatch.dispatchId)}/deploy`,
        body: {},
      });
      setSaved(true);
      setNotice(
        result.queued
          ? 'Arrival confirmation saved on this device and waiting to sync.'
          : 'Arrival confirmed. Deployment has been recorded.',
      );
      onSaved();
      if (!result.queued) onDeployed?.();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="border-line-soft bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-navy-900">
            {dispatch.quantity} {description.unit} of {description.category}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">{description.area}</p>
        </div>
        <StatusBadge status={dispatch.status} />
      </div>
      <DispatchMetadata dispatch={dispatch} />
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <DeliveryHistory dispatch={dispatch} />
      {officer && dispatch.status === 'DISPATCHED' && (
        <DistrictButton className="mt-4" disabled={saved || busy} onClick={() => void arrive()}>
          <PackageCheck size={17} aria-hidden="true" />
          {busy ? 'Confirming…' : 'Confirm Deployment'}
        </DistrictButton>
      )}
      {officer && <DispatchActions {...{ board, dispatch, onSaved }} />}
    </Card>
  );
}
function DeliveryHistory({ dispatch }: { dispatch: Dispatch }) {
  if (!dispatch.history) return null;
  return (
    <details className="my-3 text-xs text-ink-soft">
      <summary className="cursor-pointer">Delivery history</summary>
      <ol className="mt-2 space-y-2">
        {dispatch.history.map((entry, index) => (
          <li key={index}>
            {entry.action} · {dateLabel(entry.at)}
            {entry.reason ? ` · ${entry.reason}` : ''}
          </li>
        ))}
      </ol>
    </details>
  );
}

function DispatchMetadata({ dispatch }: { dispatch: Dispatch }) {
  return (
    <>
      <p className="my-3 text-xs text-ink-soft">
        Dispatched {dateLabel(dispatch.dispatchedAt)}
        {dispatch.deployedAt && ` · Arrived ${dateLabel(dispatch.deployedAt)}`}
      </p>
      <p className="my-3 flex items-center gap-2 text-sm text-ink-soft">
        <Users size={16} aria-hidden="true" />
        {dispatch.organizationName ?? 'Owning agency'} ·{' '}
        {dispatch.resourceName ?? 'Transport / team details not recorded'}
        {teamLabel(dispatch.teamSize)}
      </p>
      <p className="text-xs text-ink-soft">Driver: {dispatch.driverName ?? 'Not recorded'}</p>
      {dispatch.previousDispatchId && (
        <div className="my-3">
          <Badge
            tone="indigo"
            icon={ArrowRight}
            title={dispatch.reason ?? 'Redirected from a lower-priority response site'}
          >
            Reassigned to higher-priority zone
          </Badge>
        </div>
      )}
      {dispatch.reason && <p className="my-2 text-sm text-ink-soft">Reason: {dispatch.reason}</p>}
    </>
  );
}

function teamLabel(size?: number) {
  return size ? ` · ${size} members` : '';
}

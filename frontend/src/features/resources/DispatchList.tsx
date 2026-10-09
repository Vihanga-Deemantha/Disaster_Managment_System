import { useState } from 'react';
import { useOfflineWrite } from '@/shared/offline/useOfflineWrite';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Alert } from '@/shared/ui/Alert';
import { StatusBadge } from './AllocationList';
import { describeAllocation, dateLabel, errorMessage, type Board, type Dispatch } from './types';
export function DispatchList({
  board,
  officer,
  onSaved,
}: {
  board: Board;
  officer: boolean;
  onSaved: () => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-extrabold text-navy-900">Dispatches & arrivals</h2>
      {board.dispatches.length === 0 && (
        <Card>
          <p className="text-sm text-ink-soft">
            Dispatches appear here after an owner confirms an allocation.
          </p>
        </Card>
      )}
      {board.dispatches.map((dispatch) => (
        <DispatchCard key={dispatch.dispatchId} {...{ board, dispatch, officer, onSaved }} />
      ))}
    </section>
  );
}
function DispatchCard({
  board,
  dispatch,
  officer,
  onSaved,
}: {
  board: Board;
  dispatch: Dispatch;
  officer: boolean;
  onSaved: () => void;
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
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-navy-900">
            {dispatch.quantity} {description.unit} of {description.category}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">{description.area}</p>
        </div>
        <StatusBadge status={dispatch.status} />
      </div>
      <p className="my-3 text-xs text-ink-soft">
        Dispatched {dateLabel(dispatch.dispatchedAt)}
        {dispatch.deployedAt && ` · Arrived ${dateLabel(dispatch.deployedAt)}`}
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {officer && dispatch.status === 'DISPATCHED' && (
        <Button className="mt-3" loading={busy} disabled={saved} onClick={() => void arrive()}>
          Confirm arrival
        </Button>
      )}
    </Card>
  );
}

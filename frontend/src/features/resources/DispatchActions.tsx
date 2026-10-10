import { useRef, useState, type FormEvent } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { Button } from '@/shared/ui/Button';
import { SelectField, TextAreaField } from '@/shared/ui/Field';
import { Alert } from '@/shared/ui/Alert';
import { errorMessage, remaining, type Board, type Dispatch } from './types';

type Action = 'distribution-failed' | 'reschedule' | 'reassign';
export function DispatchActions(props: { board: Board; dispatch: Dispatch; onSaved: () => void }) {
  const state = useDispatchAction(props.dispatch, props.onSaved);
  const actionable = ['DISPATCHED', 'DISTRIBUTION_PENDING'].includes(props.dispatch.status);
  if (!actionable) return null;
  return (
    <div className="mt-3 space-y-3 border-t border-line-soft pt-3">
      {!state.online && <Alert tone="warning">Reconnect before changing a delivery.</Alert>}
      <div className="flex flex-wrap gap-2">
        {props.dispatch.status === 'DISPATCHED' ? (
          <Button
            variant="secondary"
            disabled={state.disabled}
            onClick={() => state.setAction('distribution-failed')}
          >
            Report delivery failure
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={state.disabled}
            onClick={() => state.setAction('reschedule')}
          >
            Reschedule delivery
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={state.disabled}
          onClick={() => state.setAction('reassign')}
        >
          Reassign to priority area
        </Button>
      </div>
      {state.action && <ActionDialog {...props} state={state} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.done && <Alert tone="success">Delivery updated.</Alert>}
    </div>
  );
}
function useDispatchAction(dispatch: Dispatch, onSaved: () => void) {
  const api = useApi();
  const online = useOnlineStatus();
  const keys = useRef(new Map<string, string>());
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [targetAreaId, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled || !action) return;
    if (action !== 'reschedule' && !reason.trim()) {
      setError('Enter a reason before confirming.');
      return;
    }
    const body = actionBody(action, reason, targetAreaId);
    const operation = JSON.stringify({ action, body });
    const key = keys.current.get(operation) ?? crypto.randomUUID();
    keys.current.set(operation, key);
    setBusy(true);
    setError('');
    try {
      await api.post(
        `/api/resources/dispatches/${encodeURIComponent(dispatch.dispatchId)}/${action}`,
        body,
        { idempotencyKey: key },
      );
      setDone(true);
      setAction(null);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const disabled = !online || busy || done;
  return {
    online,
    action,
    setAction,
    reason,
    setReason,
    targetAreaId,
    setTarget,
    busy,
    done,
    error,
    submit,
    disabled,
  };
}
function actionBody(action: Action, reason: string, targetAreaId: string) {
  if (action === 'reschedule') return {};
  return { reason: reason.trim(), ...(action === 'reassign' ? { targetAreaId } : {}) };
}
export function reassignmentTargets(board: Board, dispatch: Dispatch) {
  const source = board.areas.find((a) => a.areaId === dispatch.areaId);
  const need = board.needs.find((n) => n.requirementId === dispatch.requirementId);
  return board.areas.filter(
    (a) =>
      source &&
      a.district === source.district &&
      a.disasterEventId === source.disasterEventId &&
      a.priority < source.priority &&
      board.needs.some(
        (n) =>
          need &&
          n.areaId === a.areaId &&
          n.category === need.category &&
          n.resourceType === need.resourceType &&
          n.unit === need.unit &&
          remaining(n) >= dispatch.quantity,
      ),
  );
}
function ActionDialog({
  board,
  dispatch,
  state,
}: {
  board: Board;
  dispatch: Dispatch;
  state: ReturnType<typeof useDispatchAction>;
}) {
  const targets = reassignmentTargets(board, dispatch);
  return (
    <form
      onSubmit={state.submit}
      role="dialog"
      aria-label="Confirm delivery change"
      className="space-y-3 rounded-xl bg-paper p-4"
    >
      <p className="font-bold text-navy-900">
        {state.action === 'reschedule'
          ? 'Confirm another delivery attempt?'
          : 'Confirm delivery change'}
      </p>
      {state.action === 'reassign' && (
        <SelectField
          label="Higher-priority area"
          value={state.targetAreaId}
          required
          onChange={(e) => state.setTarget(e.target.value)}
        >
          <option value="">Select a destination</option>
          {targets.map((area) => (
            <option key={area.areaId} value={area.areaId}>
              {area.name} · priority {area.priority}
            </option>
          ))}
        </SelectField>
      )}
      {state.action === 'reassign' && targets.length === 0 && (
        <Alert tone="warning">No higher-priority area has enough matching outstanding need.</Alert>
      )}
      {state.action !== 'reschedule' && (
        <TextAreaField
          label="Reason for delivery change"
          required
          maxLength={500}
          value={state.reason}
          onChange={(e) => state.setReason(e.target.value)}
        />
      )}
      <div className="flex gap-3">
        <Button type="submit" loading={state.busy} disabled={state.disabled}>
          Confirm change
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={state.busy}
          onClick={() => state.setAction(null)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

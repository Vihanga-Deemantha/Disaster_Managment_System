import { useRef, useState } from 'react';
import { Check, X, FlaskConical } from 'lucide-react';
import { useApi } from '@/shared/api/ApiProvider';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { errorMessage, type Allocation } from './types';

export function DemoOwnerResponse({
  request,
  fresh,
  onSaved,
  local = false,
}: {
  request: Allocation;
  fresh: boolean;
  onSaved: () => void;
  local?: boolean;
}) {
  const state = useOwnerResponse(request, fresh, onSaved, local);
  const { disabled, error, notice, respond } = state;
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-accent-100 bg-accent-50 p-4">
      <p className="flex items-center gap-2 text-xs font-bold text-accent-700">
        <FlaskConical size={14} aria-hidden="true" />
        Evaluator demo · acting as resource owner
      </p>
      <ResponseFields request={request} state={state} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void respond(true)}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-success-600 bg-white px-4 text-sm font-semibold text-success-600 disabled:opacity-50"
        >
          <Check size={15} aria-hidden="true" />
          Demo Accept
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void respond(false)}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-danger-600 bg-white px-4 text-sm font-semibold text-danger-600 disabled:opacity-50"
        >
          <X size={15} aria-hidden="true" />
          Demo Reject
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm font-medium text-navy-900">
          {notice}
        </p>
      )}
    </div>
  );
}

function ResponseFields({
  request,
  state,
}: {
  request: Allocation;
  state: ReturnType<typeof useOwnerResponse>;
}) {
  const { quantity, setQuantity, reason, setReason, disabled } = state;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-ink-soft">
        Quantity to confirm
        <input
          aria-label={`Demo confirmed quantity for ${request.requestId}`}
          type="number"
          min="0.01"
          step="any"
          max={request.requestedQty}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={disabled}
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-900"
        />
      </label>
      <label className="text-xs font-semibold text-ink-soft">
        Decline reason
        <input
          aria-label={`Demo decline reason for ${request.requestId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
          placeholder="e.g. Vehicle unavailable"
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy-900"
        />
      </label>
    </div>
  );
}

function useOwnerResponse(
  request: Allocation,
  fresh: boolean,
  onSaved: () => void,
  local: boolean,
) {
  const api = useApi();
  const online = useOnlineStatus();
  const [quantity, setQuantity] = useState(String(request.requestedQty));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const keys = useRef(new Map<string, string>());
  const disabled = !fresh || !online || busy || Boolean(notice);
  async function respond(confirm: boolean) {
    if (disabled) return;
    const body = confirm ? { quantity: Number(quantity) } : { reason: reason.trim() };
    const validationError = responseError(confirm, Number(quantity), request.requestedQty, reason);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError('');
    const payload = JSON.stringify(body);
    const key = keys.current.get(payload) ?? crypto.randomUUID();
    keys.current.set(payload, key);
    try {
      const base = local
        ? '/api/resources/dev/simulator/requests/'
        : '/api/resources/dev/requests/';
      await api.post(base + encodeURIComponent(request.requestId) + '/respond', body, {
        idempotencyKey: key,
      });
      setNotice(
        confirm
          ? 'Simulated owner confirmed. Delivery is now in transit.'
          : 'Simulated owner declined. Reserved stock has been released.',
      );
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return { quantity, setQuantity, reason, setReason, disabled, error, notice, respond };
}

function responseError(confirm: boolean, quantity: number, maximum: number, reason: string) {
  if (!confirm) return reason.trim() ? '' : 'Enter a reason for declining.';
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > maximum)
    return 'Enter a positive quantity within the requested amount.';
  return '';
}

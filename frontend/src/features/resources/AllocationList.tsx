import { useRef, useState, type FormEvent } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { useAuth } from '@/shared/auth/AuthContext';
import { Button } from '@/shared/ui/Button';
import { TextField, TextAreaField } from '@/shared/ui/Field';
import { Card } from '@/shared/ui/Card';
import { Alert } from '@/shared/ui/Alert';
import { ResponseDeadline } from './ResponseDeadline';
import { RequestDemoExpiry } from './DemoControls';
import { DemoOwnerResponse } from './SimulatorResponse';
import { Badge, EmptyState, OperationalStatus } from './ResourceUI';
import { Inbox, PackageCheck, FlaskConical } from 'lucide-react';
import {
  describeAllocation,
  dateLabel,
  errorMessage,
  label,
  type Allocation,
  type Board,
} from './types';
export function StatusBadge({ status }: { status: string }) {
  return <OperationalStatus status={status} />;
}
export function AllocationList({
  board,
  owner,
  fresh,
  onSaved,
}: {
  board: Board;
  owner: boolean;
  fresh: boolean;
  onSaved: () => void;
}) {
  const [filter, setFilter] = useState('ALL');
  const [simulate, setSimulate] = useState(true);
  const { user } = useAuth();
  const demo = import.meta.env.DEV && user?.role === 'DISTRICT_OFFICER';
  const requests = board.requests
    .filter((r) => filter === 'ALL' || r.status === filter)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="space-y-4">
      {demo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
              <FlaskConical size={16} aria-hidden="true" />
              Evaluator demonstration
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Simulated owner responses update this local development database.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-accent-700">
            <input
              type="checkbox"
              checked={simulate}
              onChange={(e) => setSimulate(e.target.checked)}
            />
            Simulate Resource Owner
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold text-navy-900">
          {owner ? 'Agency request inbox' : 'Allocation requests'}
        </h2>
        <label className="text-sm text-ink-soft">
          Show{' '}
          <select
            aria-label="Request status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-2 rounded-lg border border-line bg-white px-3 py-2"
          >
            {['ALL', 'PENDING', 'CONFIRMED', 'REJECTED', 'NO_RESPONSE'].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {requests.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No allocation requests to show"
          detail="Send an allocation from an affected area. Owner responses and deadlines will appear here."
        />
      )}
      {requests.map((request) => (
        <RequestCard
          key={request.requestId}
          {...{ request, board, owner, fresh, onSaved }}
          simulate={demo && simulate}
        />
      ))}
    </section>
  );
}
function RequestCard({
  request,
  board,
  owner,
  fresh,
  onSaved,
  simulate,
}: {
  request: Allocation;
  board: Board;
  owner: boolean;
  fresh: boolean;
  onSaved: () => void;
  simulate: boolean;
}) {
  const description = describeAllocation(board, request.requirementId);
  return (
    <Card className="border-line-soft bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-navy-900">
            {description.category} · {description.area}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Requested {request.requestedQty} {description.unit} ·{' '}
            {label(request.organizationId.replace('org-', ''))}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Sent {dateLabel(request.createdAt)} · Respond by {dateLabel(request.respondBy)}
      </p>
      {request.status === 'PENDING' && <ResponseDeadline deadline={request.respondBy} />}
      <RequestDemoExpiry request={request} fresh={fresh} onSaved={onSaved} />
      {simulate && request.status === 'PENDING' && (
        <DemoOwnerResponse request={request} fresh={fresh} onSaved={onSaved} />
      )}
      <RequestOutcome request={request} unit={description.unit} />
      {owner && request.status === 'PENDING' && (
        <OwnerResponse request={request} fresh={fresh} onSaved={onSaved} />
      )}
    </Card>
  );
}
function OwnerResponse({
  request,
  fresh,
  onSaved,
}: {
  request: Allocation;
  fresh: boolean;
  onSaved: () => void;
}) {
  const api = useApi();
  const online = useOnlineStatus();
  const [quantity, setQuantity] = useState(String(request.requestedQty));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const keys = useRef(new Map<string, string>());
  const disabled = !online || !fresh || busy || done;
  async function respond(body: { quantity: number } | { reason: string }) {
    setBusy(true);
    setError('');
    const operation = JSON.stringify(body);
    const key = keys.current.get(operation) ?? crypto.randomUUID();
    keys.current.set(operation, key);
    try {
      await api.post(
        `/api/resources/allocation-requests/${encodeURIComponent(request.requestId)}/respond`,
        body,
        { idempotencyKey: key },
      );
      setDone(true);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function confirm(e: FormEvent) {
    e.preventDefault();
    if (!disabled) void respond({ quantity: Number(quantity) });
  }
  function decline() {
    if (!reason.trim()) {
      setError('Enter a reason before declining this request.');
      return;
    }
    void respond({ reason: reason.trim() });
  }
  return (
    <form onSubmit={confirm} className="mt-5 space-y-3 border-t border-line-soft pt-4">
      {!online || !fresh ? (
        <Alert tone="warning">
          Reconnect and refresh before responding to an allocation request.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Quantity to confirm"
          type="number"
          min="0.01"
          step="any"
          max={request.requestedQty}
          required
          value={quantity}
          disabled={disabled}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <TextAreaField
          label="Reason for declining"
          value={reason}
          disabled={disabled}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <ResponseHint />
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">Response saved.</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy} disabled={disabled}>
          Confirm allocation
        </Button>
        <Button type="button" variant="danger" disabled={disabled} onClick={decline}>
          Decline request
        </Button>
      </div>
    </form>
  );
}
function ResponseHint() {
  return (
    <p className="text-xs text-ink-soft">
      Confirm the full quantity or a smaller amount. Unconfirmed stock returns to available
      inventory.
    </p>
  );
}

function RequestOutcome({ request, unit }: { request: Allocation; unit: string }) {
  return (
    <>
      {request.confirmedQty !== undefined && (
        <p className="mt-2 text-sm font-bold text-success-600">
          Confirmed {request.confirmedQty} {unit}
        </p>
      )}
      {request.confirmedQty !== undefined && request.confirmedQty < request.requestedQty && (
        <div className="mt-3">
          <Badge
            tone="amber"
            icon={PackageCheck}
            title="The owner confirmed less than requested. The unconfirmed remainder returns to the allocation gap."
          >
            Partial fulfillment approved
          </Badge>
        </div>
      )}
      {request.reason && <p className="mt-2 text-sm text-ink-soft">Reason: {request.reason}</p>}
      {request.status === 'NO_RESPONSE' && (
        <p className="mt-2 text-sm text-ink-soft">
          Response deadline passed. Reserved stock has been released.
        </p>
      )}
    </>
  );
}

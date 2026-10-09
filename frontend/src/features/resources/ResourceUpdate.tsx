import { useRef, useState, type FormEvent } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { TextField, SelectField } from '@/shared/ui/Field';
import { Button } from '@/shared/ui/Button';
import { Alert } from '@/shared/ui/Alert';
import { errorMessage, label, type Supply } from './types';

function useResourceUpdate(item: Supply, fresh: boolean, onSaved: () => void) {
  const api = useApi();
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const keys = useRef(new Map<string, string>());
  const disabled = !online || !fresh || busy || done;
  async function save(body: object) {
    if (disabled) return;
    setBusy(true);
    setError('');
    const operation = JSON.stringify(body);
    const key = keys.current.get(operation) ?? crypto.randomUUID();
    keys.current.set(operation, key);
    const action = item.resourceType === 'RESCUE_TEAM' ? 'team-status' : 'occupancy';
    try {
      await api.post(
        `/api/resources/inventory/${encodeURIComponent(item.resourceId)}/${action}`,
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
  return { save, disabled, busy, error, done, online };
}
export function ResourceUpdate({
  item,
  fresh,
  onSaved,
}: {
  item: Supply;
  fresh: boolean;
  onSaved: () => void;
}) {
  const state = useResourceUpdate(item, fresh, onSaved);
  return (
    <div className="space-y-3 border-t border-line-soft pt-4">
      {(!state.online || !fresh) && (
        <Alert tone="warning">Reconnect and refresh before updating field resources.</Alert>
      )}
      {item.resourceType === 'RESCUE_TEAM' ? (
        <TeamForm item={item} state={state} />
      ) : (
        <OccupancyForm item={item} state={state} />
      )}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.done && <Alert tone="success">Field resource updated.</Alert>}
    </div>
  );
}
type UpdateProps = { item: Supply; state: ReturnType<typeof useResourceUpdate> };
function TeamForm({ item, state }: UpdateProps) {
  const [status, setStatus] = useState(item.status);
  const [lat, setLat] = useState(String(item.location?.lat ?? ''));
  const [lng, setLng] = useState(String(item.location?.lng ?? ''));
  function submit(e: FormEvent) {
    e.preventDefault();
    void state.save({ status, location: { lat: Number(lat), lng: Number(lng) } });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <SelectField
        label={`Team status for ${item.name}`}
        value={status}
        disabled={state.disabled}
        onChange={(e) => setStatus(e.target.value)}
      >
        {['AVAILABLE', 'UNAVAILABLE', 'DEPLOYED'].map((value) => (
          <option key={value} value={value}>
            {label(value)}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={`Latitude for ${item.name}`}
          type="number"
          min={-90}
          max={90}
          step="any"
          required
          value={lat}
          disabled={state.disabled}
          onChange={(e) => setLat(e.target.value)}
        />
        <TextField
          label={`Longitude for ${item.name}`}
          type="number"
          min={-180}
          max={180}
          step="any"
          required
          value={lng}
          disabled={state.disabled}
          onChange={(e) => setLng(e.target.value)}
        />
      </div>
      <p className="text-xs text-ink-soft">
        Mark Available when the team finishes its assignment. Pending requests and teams in transit
        must be resolved first.
      </p>
      <Button type="submit" loading={state.busy} disabled={state.disabled}>
        Update team status
      </Button>
    </form>
  );
}
function OccupancyForm({ item, state }: UpdateProps) {
  const [occupancy, setOccupancy] = useState(String(item.currentOccupancy));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void state.save({ occupancy: Number(occupancy) });
      }}
    >
      <TextField
        label={`Current occupancy at ${item.name}`}
        type="number"
        min={0}
        max={item.capacity}
        step={1}
        required
        value={occupancy}
        disabled={state.disabled}
        onChange={(e) => setOccupancy(e.target.value)}
      />
      <p className="text-xs text-ink-soft">
        Reserved and confirmed places stay protected. Allocation arrivals update occupancy
        automatically.
      </p>
      <Button type="submit" loading={state.busy} disabled={state.disabled}>
        Update shelter occupancy
      </Button>
    </form>
  );
}

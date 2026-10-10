import { useState } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { useAuth } from '@/shared/auth/AuthContext';
import { Button } from '@/shared/ui/Button';
import { SelectField } from '@/shared/ui/Field';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { errorMessage, type Allocation } from './types';

export function PartnerDemoControls() {
  const api = useApi();
  const online = useOnlineStatus();
  const [organizationId, setOrganization] = useState('org-red-cross');
  const [mode, setMode] = useState('STALE');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function apply() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.put(
        `/api/resources/dev/partners/${organizationId}/mode`,
        { mode },
        { idempotencyKey: crypto.randomUUID() },
      );
      setMessage(
        `Demo partner mode set to ${mode}. Refresh the resource search to see the change.`,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="text-lg font-bold text-navy-900">Partner feed simulation</h2>
      <p className="my-2 text-sm text-ink-soft">
        Development demo: change an agency feed for all districts. OK refreshes its saved
        availability; STALE and DOWN block new requests.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Demo partner"
          value={organizationId}
          onChange={(e) => setOrganization(e.target.value)}
        >
          <option value="org-red-cross">Sri Lanka Red Cross</option>
          <option value="org-sl-army">Sri Lanka Army</option>
          <option value="org-irrigation-dept">Irrigation Department</option>
        </SelectField>
        <SelectField label="Feed mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {['OK', 'STALE', 'DOWN'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </SelectField>
      </div>
      <Button className="mt-3" loading={busy} disabled={!online} onClick={() => void apply()}>
        Apply demo mode
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
    </Card>
  );
}
export function DemoExpiry({ requestId, onSaved }: { requestId: string; onSaved: () => void }) {
  const api = useApi();
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function expire() {
    setBusy(true);
    setError('');
    try {
      await api.post(
        `/api/resources/dev/requests/${encodeURIComponent(requestId)}/expire`,
        {},
        { idempotencyKey: crypto.randomUUID() },
      );
      setDone(true);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3">
      <Button
        variant="ghost"
        loading={busy}
        disabled={!online || done}
        onClick={() => void expire()}
      >
        Demo: simulate no response
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
export function RequestDemoExpiry({
  request,
  fresh,
  onSaved,
}: {
  request: Allocation;
  fresh: boolean;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  return import.meta.env.DEV &&
    user?.role === 'DISTRICT_OFFICER' &&
    request.status === 'PENDING' &&
    fresh ? (
    <DemoExpiry requestId={request.requestId} onSaved={onSaved} />
  ) : null;
}

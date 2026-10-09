import { useState, type FormEvent } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOfflineWrite } from '@/shared/offline/useOfflineWrite';
import { SelectField, TextField } from '@/shared/ui/Field';
import { Button } from '@/shared/ui/Button';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { errorMessage, label, remaining, type Board, type Need, type Supply } from './types';
export function RequestForm({ board, onSaved }: { board: Board; onSaved: () => void }) {
  const [areaId, setArea] = useState('');
  const [needId, setNeed] = useState('');
  const needs = board.needs.filter((n) => n.areaId === areaId && remaining(n) > 0);
  const need = needs.find((n) => n.requirementId === needId);
  return (
    <Card>
      <h2 className="text-lg font-extrabold text-navy-900">Request relief supplies</h2>
      <p className="mb-5 mt-1 text-sm text-ink-soft">
        Choose an affected area, its requirement, and an agency with available stock.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Affected area"
          value={areaId}
          onChange={(e) => {
            setArea(e.target.value);
            setNeed('');
          }}
        >
          <option value="">Select an area</option>
          {board.areas.map((a) => (
            <option key={a.areaId} value={a.areaId}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Resource requirement"
          value={needId}
          disabled={!areaId}
          onChange={(e) => setNeed(e.target.value)}
        >
          <option value="">Select a requirement</option>
          {needs.map((n) => (
            <option key={n.requirementId} value={n.requirementId}>
              {label(n.category)} · {remaining(n)} {n.unit} to request
            </option>
          ))}
        </SelectField>
      </div>
      {areaId && needs.length === 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          All needs in this area are fulfilled or awaiting owner responses.
        </p>
      )}
      {need && <SupplyForm key={need.requirementId} need={need} onSaved={onSaved} />}
    </Card>
  );
}
function SupplyForm({ need, onSaved }: { need: Need; onSaved: () => void }) {
  return <SupplyFields state={useSupplyRequest(need, onSaved)} />;
}
function useSupplyRequest(need: Need, onSaved: () => void) {
  const api = useApi();
  const write = useOfflineWrite();
  const stock = useCachedResource({
    module: 'resources',
    name: `stock:${need.requirementId}`,
    load: () =>
      api.get<{ resources: Supply[] }>(
        `/api/resources/requirements/${encodeURIComponent(need.requirementId)}/resources`,
      ),
  });
  const [resourceId, setResource] = useState('');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const supply = stock.data?.resources.find((s) => s.resourceId === resourceId);
  const maximum = Math.min(remaining(need), supply?.availableQty ?? 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supply || Number(quantity) <= 0 || Number(quantity) > maximum) {
      setError('Choose available stock and a quantity within the remaining need.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await write({
        module: 'resources',
        method: 'POST',
        url: '/api/resources/allocation-requests',
        body: { requirementId: need.requirementId, resourceId, quantity: Number(quantity) },
      });
      setNotice(
        result.queued
          ? 'Request saved on this device. Stock will be checked when it syncs.'
          : 'Request sent. The resource owner has 30 minutes to respond.',
      );
      setQuantity('');
      stock.reload();
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return {
    stock,
    resourceId,
    quantity,
    busy,
    notice,
    error,
    supply,
    maximum,
    submit,
    setResource,
    setQuantity,
  };
}
function SupplyFields({ state }: { state: ReturnType<typeof useSupplyRequest> }) {
  const {
    stock,
    resourceId,
    quantity,
    busy,
    notice,
    error,
    supply,
    maximum,
    submit,
    setResource,
    setQuantity,
  } = state;
  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <StockStatus stock={stock} />
      <SelectField
        label="Resource owner"
        required
        value={resourceId}
        disabled={busy || !stock.data}
        onChange={(e) => {
          setResource(e.target.value);
          setQuantity('');
        }}
      >
        <option value="">Select an agency</option>
        {stock.data?.resources.map((s) => (
          <option
            key={s.resourceId}
            value={s.resourceId}
            disabled={s.status !== 'AVAILABLE' || s.availableQty <= 0}
          >
            {s.organizationName} · {s.availableQty} {s.unit} available
          </option>
        ))}
      </SelectField>
      {supply && (
        <div className="rounded-xl bg-paper p-4 text-sm">
          <strong>{supply.organizationName}</strong>
          <p className="mt-1 text-ink-soft">
            {supply.availableQty} {supply.unit} available · {supply.reservedQty} reserved · up to{' '}
            {maximum} can be requested.
          </p>
        </div>
      )}
      <TextField
        label="Quantity to request"
        type="number"
        min="0.01"
        step="any"
        max={maximum}
        required
        disabled={!supply || busy}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Button type="submit" loading={busy} disabled={!supply || maximum <= 0}>
        Send allocation request
      </Button>
    </form>
  );
}
function StockStatus({ stock }: { stock: ReturnType<typeof useSupplyRequest>['stock'] }) {
  return (
    <>
      {Boolean(stock.error) && (
        <Alert tone="danger">
          {errorMessage(stock.error)}{' '}
          <Button type="button" variant="ghost" onClick={stock.reload}>
            Retry stock search
          </Button>
        </Alert>
      )}
      {stock.loading && (
        <p role="status" className="text-sm text-ink-soft">
          Checking agency stock…
        </p>
      )}
      {stock.fromCache && (
        <Alert tone="warning">
          Saved stock levels are shown. Availability will be checked when your request syncs.
        </Alert>
      )}
    </>
  );
}

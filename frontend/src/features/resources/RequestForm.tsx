import { useState, type FormEvent } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOfflineWrite } from '@/shared/offline/useOfflineWrite';
import { SelectField, TextField } from '@/shared/ui/Field';
import { Button } from '@/shared/ui/Button';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { ApiError } from '@/shared/api/errors';
import { errorMessage, label, remaining, type Board, type Need, type Supply } from './types';
export function RequestForm({
  board,
  onSaved,
  initialAreaId = '',
}: {
  board: Board;
  onSaved: () => void;
  initialAreaId?: string;
}) {
  const [areaId, setArea] = useState(initialAreaId);
  const [needId, setNeed] = useState('');
  const needs = board.needs.filter((n) => n.areaId === areaId && remaining(n) > 0);
  const need = needs.find((n) => n.requirementId === needId);
  return (
    <Card>
      <h2 className="text-lg font-extrabold text-navy-900">Request resources</h2>
      <p className="mb-5 mt-1 text-sm text-ink-soft">
        Choose an affected area, its requirement, and an owner with supplies, a rescue team or
        shelter places.
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
  const [partial, setPartial] = useState<{ available: number; shortfall: number } | null>(null);
  const supply = stock.data?.resources.find((s) => s.resourceId === resourceId);
  const maximum = remaining(need);
  const wholeUnits = need.resourceType === 'RESCUE_TEAM' || need.resourceType === 'SHELTER';
  async function submit(e?: FormEvent, acceptPartial = false) {
    e?.preventDefault();
    if (invalidSelection(supply, Number(quantity), maximum)) {
      setError('Choose available stock and a quantity within the remaining need.');
      return;
    }
    if (needsPartial(supply!, Number(quantity), acceptPartial)) {
      setPartial({
        available: supply!.availableQty,
        shortfall: Number(quantity) - supply!.availableQty,
      });
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
        body: requestBody(need.requirementId, resourceId, Number(quantity), acceptPartial),
      });
      setNotice(
        result.queued
          ? 'Request saved on this device. Stock will be checked when it syncs.'
          : 'Request sent. The resource owner has 30 minutes to respond.',
      );
      setQuantity('');
      setPartial(null);
      stock.reload();
      onSaved();
    } catch (failure) {
      const shortfall = stockShortfall(failure);
      if (shortfall) setPartial(shortfall);
      else setError(errorMessage(failure));
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
    wholeUnits,
    submit,
    setResource,
    setQuantity,
    partial,
    setPartial,
  };
}
function SupplyFields({ state }: { state: ReturnType<typeof useSupplyRequest> }) {
  const { stock, quantity, busy, notice, error, supply, maximum, wholeUnits, submit, setQuantity } =
    state;
  const quantityInput = quantityAttributes(wholeUnits);
  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <StockStatus stock={stock} />
      <SupplySelection state={state} />
      {supply && (
        <div className="rounded-xl bg-paper p-4 text-sm">
          <strong>{supply.organizationName}</strong>
          <p className="mt-1 text-ink-soft">
            {supply.availableQty} {supply.unit} available · {supply.reservedQty} reserved · up to{' '}
            {maximum} can be requested.
          </p>
          <SupplyDistance supply={supply} />
        </div>
      )}
      <TextField
        label="Quantity to request"
        type="number"
        {...quantityInput}
        max={maximum}
        required
        disabled={!supply || busy}
        value={quantity}
        onChange={(e) => {
          setQuantity(e.target.value);
          state.setPartial(null);
        }}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {state.partial && <PartialPrompt state={state} />}
      <Button type="submit" loading={busy} disabled={!supply || maximum <= 0}>
        Send allocation request
      </Button>
    </form>
  );
}
function requestBody(
  requirementId: string,
  resourceId: string,
  quantity: number,
  acceptPartial: boolean,
) {
  return { requirementId, resourceId, quantity, ...(acceptPartial ? { acceptPartial: true } : {}) };
}
function SupplySelection({ state }: { state: ReturnType<typeof useSupplyRequest> }) {
  return (
    <SelectField
      label="Resource owner"
      required
      value={state.resourceId}
      disabled={state.busy || !state.stock.data}
      onChange={(e) => {
        state.setResource(e.target.value);
        state.setQuantity('');
        state.setPartial(null);
      }}
    >
      <option value="">Select an agency</option>
      <SupplyOptions supplies={state.stock.data?.resources ?? []} />
    </SelectField>
  );
}
function invalidSelection(supply: Supply | undefined, quantity: number, maximum: number) {
  return (
    !supply ||
    supply.status !== 'AVAILABLE' ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > maximum
  );
}
function needsPartial(supply: Supply, quantity: number, acceptPartial: boolean) {
  return !acceptPartial && quantity > supply.availableQty;
}
function stockShortfall(failure: unknown) {
  if (failure instanceof ApiError && failure.code === 'INSUFFICIENT_QUANTITY') {
    const available = Number(failure.details.available);
    const shortfall = Number(failure.details.shortfall);
    if (Number.isFinite(available) && available > 0 && Number.isFinite(shortfall))
      return { available, shortfall };
  }
  return null;
}
function SupplyOptions({ supplies }: { supplies: Supply[] }) {
  return supplies.map((s) => (
    <option
      key={s.resourceId}
      value={s.resourceId}
      disabled={s.status !== 'AVAILABLE' || s.availableQty <= 0}
    >
      {s.organizationName}
      {s.name ? ` · ${s.name}` : ''} ·{' '}
      {s.status === 'UNKNOWN'
        ? 'Status unknown — partner data is stale'
        : `${s.availableQty} ${s.unit} available`}
    </option>
  ));
}
function SupplyDistance({ supply }: { supply: Supply }) {
  return (
    <p className="mt-1 text-ink-soft">
      {label(supply.organizationType)} ·{' '}
      {supply.distanceKm !== undefined
        ? `${supply.distanceKm} km away (straight-line estimate)`
        : 'Distance not available'}
    </p>
  );
}
function PartialPrompt({ state }: { state: ReturnType<typeof useSupplyRequest> }) {
  const partial = state.partial!;
  return (
    <div
      role="alertdialog"
      aria-label="Partial allocation"
      className="rounded-xl border border-accent-300 bg-paper p-4"
    >
      <p className="font-bold text-navy-900">
        Only {partial.available} available · shortfall {partial.shortfall}.
      </p>
      <p className="my-2 text-sm text-ink-soft">
        Request the available quantity? The rest remains outstanding. Stock is checked again when
        sent.
      </p>
      <div className="flex gap-3">
        <Button
          type="button"
          loading={state.busy}
          onClick={() => void state.submit(undefined, true)}
        >
          Accept partial allocation
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={state.busy}
          onClick={() => state.setPartial(null)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
function quantityAttributes(wholeUnits: boolean) {
  return wholeUnits ? { min: 1, step: 1 } : { min: 0.01, step: 'any' };
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

import { RequestForm } from '../RequestForm';
import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ResourcesPage } from '..';
import { resourcesNav } from '../nav';
import { renderWithProviders } from '@/shared/testing/render';
import { signIn, setBrowserOnline, resetBrowserOnline, settle } from '@/shared/testing/auth';
import { makeMe } from '@/shared/testing/fixtures';
import { server } from '@/shared/testing/server';
import { outbox } from '@/shared/offline/outbox';
import {
  describeAllocation,
  errorMessage,
  label,
  remaining,
  type Board,
  type Supply,
} from '../types';

const needId = 'need-water';
const supply: Supply = {
  resourceId: 'red-cross-WATER',
  organizationId: 'org-red-cross',
  organizationName: 'Sri Lanka Red Cross',
  organizationType: 'NGO',
  category: 'WATER',
  unit: 'packs',
  status: 'AVAILABLE',
  availableQty: 80,
  reservedQty: 0,
};
const pending = {
  requestId: 'request-1',
  requirementId: needId,
  resourceId: supply.resourceId,
  organizationId: supply.organizationId,
  requestedQty: 50,
  status: 'PENDING' as const,
  createdAt: '2026-10-09T09:00:00Z',
  respondBy: '2026-10-09T09:30:00Z',
};
let board: Board;
beforeEach(() => {
  resetBrowserOnline();
  board = {
    areas: [
      {
        areaId: 'area-1',
        name: 'Gampaha flood response area',
        district: 'GAMPAHA',
        priority: 1,
        disasterEventId: 'event-1',
      },
    ],
    needs: [
      {
        requirementId: needId,
        areaId: 'area-1',
        category: 'WATER',
        unit: 'packs',
        requiredQty: 100,
        fulfilledQty: 0,
        pendingQty: 0,
      },
    ],
    requests: [],
    dispatches: [],
  };
  server.use(
    http.get('/api/hazard-reports/district/situation', () => HttpResponse.json([])),
    http.get('/api/warnings/district/situation', () => HttpResponse.json([])),
    http.get('/api/resources/inventory', () => HttpResponse.json([])),
    http.get('/api/resources/notifications', () => HttpResponse.json([])),
    http.get('/api/resources/board', () => HttpResponse.json(board)),
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json({ resources: [supply] }),
    ),
  );
});

/** Retain API/offline regression coverage for the reusable legacy request form. New drawer flows have their own workspace tests. */
function RequestFormHarness() {
  const api = useApi();
  const state = useCachedResource({
    module: 'resources',
    name: 'board',
    load: () => api.get<Board>('/api/resources/board'),
  });
  return (
    <>
      <button onClick={state.reload}>Refresh</button>
      {Boolean(state.error) && <p>{errorMessage(state.error)}</p>}
      {state.data && <RequestForm board={state.data} onSaved={state.reload} />}
    </>
  );
}
async function open(role: 'DISTRICT_OFFICER' | 'NGO_MANAGER' | 'DMC_OFFICER' = 'DISTRICT_OFFICER') {
  signIn(makeMe({ role, district: 'GAMPAHA', organizationId: 'org-red-cross' }));
  if (role === 'DISTRICT_OFFICER' && !board.requests.length && !board.dispatches.length)
    return renderWithProviders(<RequestFormHarness />);
  const rendered = renderWithProviders(<ResourcesPage />);
  const tab =
    role === 'NGO_MANAGER' || board.requests.length
      ? 'Requests & Responses'
      : 'Affected Areas & Needs';
  const selected =
    board.dispatches.length && role === 'DISTRICT_OFFICER' ? 'Dispatches & Arrivals' : tab;
  fireEvent.click(await screen.findByRole('tab', { name: selected }));
  return rendered;
}
async function selectSupply() {
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText('Affected area'), 'area-1');
  await user.selectOptions(screen.getByLabelText('Resource requirement'), needId);
  await screen.findByRole('option', { name: /Sri Lanka Red Cross/ });
  await user.selectOptions(screen.getByLabelText('Resource owner'), supply.resourceId);
  return user;
}
it('loads district requirements and requests stock with a CSRF header and idempotency key', async () => {
  let sent: unknown;
  server.use(
    http.post('/api/resources/allocation-requests', async ({ request }) => {
      sent = await request.json();
      expect(request.headers.get('Idempotency-Key')).toBeTruthy();
      expect(request.headers.get('X-Requested-With')).toBe('SafeZone');
      board.requests.push(pending);
      board.needs[0]!.pendingQty = 50;
      return HttpResponse.json(pending, { status: 201 });
    }),
  );
  await open();
  const user = await selectSupply();
  expect(screen.getByLabelText('Quantity to request')).toHaveAttribute('max', '100');
  await user.type(screen.getByLabelText('Quantity to request'), '50');
  await user.click(screen.getByRole('button', { name: 'Send allocation request' }));
  expect(await screen.findByText(/Request sent/)).toBeInTheDocument();
  expect(sent).toEqual({ requirementId: needId, resourceId: supply.resourceId, quantity: 50 });
  expect(await screen.findByRole('option', { name: /50 packs to request/ })).toBeInTheDocument();
});
it('shows a stock conflict without reporting a successful request', async () => {
  server.use(
    http.post('/api/resources/allocation-requests', () =>
      HttpResponse.json(
        {
          error: {
            code: 'INSUFFICIENT_QUANTITY',
            message: 'Stock changed. Refresh and choose another agency.',
          },
        },
        { status: 409 },
      ),
    ),
  );
  await open();
  const user = await selectSupply();
  await user.type(screen.getByLabelText('Quantity to request'), '50');
  await user.click(screen.getByRole('button', { name: 'Send allocation request' }));
  expect(await screen.findByText(/Stock changed/)).toBeInTheDocument();
  expect(screen.queryByText(/Request sent/)).not.toBeInTheDocument();
});
it('keeps zero and unavailable stock unselectable', async () => {
  server.use(
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json({
        resources: [
          { ...supply, availableQty: 0 },
          {
            ...supply,
            resourceId: 'other',
            organizationName: 'Other agency',
            status: 'UNAVAILABLE',
          },
        ],
      }),
    ),
  );
  await open();
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText('Affected area'), 'area-1');
  await user.selectOptions(screen.getByLabelText('Resource requirement'), needId);
  expect(await screen.findByRole('option', { name: /Sri Lanka Red Cross/ })).toBeDisabled();
  expect(screen.getByRole('option', { name: /Other agency/ })).toBeDisabled();
});
it('lets the owner confirm a smaller quantity and shows the resulting dispatch', async () => {
  board.requests = [pending];
  let sent: unknown;
  server.use(
    http.post('/api/resources/allocation-requests/:id/respond', async ({ request }) => {
      sent = await request.json();
      board.requests = [{ ...pending, status: 'CONFIRMED', confirmedQty: 30 }];
      board.dispatches = [
        {
          dispatchId: 'dispatch-1',
          requestId: pending.requestId,
          requirementId: needId,
          areaId: 'area-1',
          quantity: 30,
          status: 'DISPATCHED',
          dispatchedAt: pending.createdAt,
        },
      ];
      return HttpResponse.json(board.requests[0]);
    }),
  );
  await open('NGO_MANAGER');
  const user = userEvent.setup();
  const quantity = await screen.findByLabelText('Quantity to confirm');
  await user.clear(quantity);
  await user.type(quantity, '30');
  await user.click(screen.getByRole('button', { name: 'Confirm allocation' }));
  expect(await screen.findByText('Confirmed 30 packs')).toBeInTheDocument();
  expect(sent).toEqual({ quantity: 30 });
  await user.click(screen.getByRole('tab', { name: 'Dispatches & Arrivals' }));
  expect(await screen.findByText('30 packs of Water')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm Deployment' })).not.toBeInTheDocument();
});
it('requires a decline reason and sends the trimmed reason', async () => {
  board.requests = [pending];
  let sent: unknown;
  server.use(
    http.post('/api/resources/allocation-requests/:id/respond', async ({ request }) => {
      sent = await request.json();
      board.requests = [{ ...pending, status: 'REJECTED', reason: 'Truck unavailable' }];
      return HttpResponse.json(board.requests[0]);
    }),
  );
  await open('NGO_MANAGER');
  const user = userEvent.setup();
  await screen.findByLabelText('Reason for declining');
  await user.click(screen.getByRole('button', { name: 'Decline request' }));
  expect(await screen.findByText(/Enter a reason/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('Reason for declining'), '  Truck unavailable  ');
  await user.click(screen.getByRole('button', { name: 'Decline request' }));
  expect(await screen.findByText('Reason: Truck unavailable')).toBeInTheDocument();
  expect(sent).toEqual({ reason: 'Truck unavailable' });
});
it('preserves the same idempotency key when retrying an owner response', async () => {
  board.requests = [pending];
  const keys: string[] = [];
  server.use(
    http.post('/api/resources/allocation-requests/:id/respond', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!);
      return HttpResponse.json(
        { error: { code: 'UNAVAILABLE', message: 'Please retry.' } },
        { status: 503 },
      );
    }),
  );
  await open('NGO_MANAGER');
  const user = userEvent.setup();
  await screen.findByLabelText('Quantity to confirm');
  await user.click(screen.getByRole('button', { name: 'Confirm allocation' }));
  await screen.findByText('Please retry.');
  await user.click(screen.getByRole('button', { name: 'Confirm allocation' }));
  await waitFor(() => expect(keys).toHaveLength(2));
  expect(keys[0]).toBe(keys[1]);
});
it('records an arrival and removes the arrival action after refresh', async () => {
  board.requests = [{ ...pending, status: 'CONFIRMED', confirmedQty: 50 }];
  board.dispatches = [
    {
      dispatchId: 'dispatch-1',
      requestId: pending.requestId,
      requirementId: needId,
      areaId: 'area-1',
      quantity: 50,
      status: 'DISPATCHED',
      dispatchedAt: pending.createdAt,
    },
  ];
  server.use(
    http.post('/api/resources/dispatches/:id/deploy', () => {
      board.dispatches[0]!.status = 'DEPLOYED';
      board.dispatches[0]!.deployedAt = pending.createdAt;
      return HttpResponse.json({});
    }),
  );
  await open();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Confirm Deployment' }));
  expect(await screen.findByText(/Arrival confirmed/)).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Confirm Deployment' })).not.toBeInTheDocument(),
  );
});
it('shows DMC a read-only overview', async () => {
  board.requests = [pending];
  await open('DMC_OFFICER');
  await screen.findByRole('heading', { name: 'National Resource Operations' });
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Requests & Responses' }));
  await screen.findByText(/Requested 50 packs/);
  expect(screen.queryByLabelText('Affected area')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm allocation' })).not.toBeInTheDocument();
});
it('filters expired requests and explains stock release', async () => {
  board.requests = [pending, { ...pending, requestId: 'expired', status: 'NO_RESPONSE' }];
  await open();
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText('Request status'), 'NO_RESPONSE');
  expect(await screen.findByText(/Reserved stock has been released/)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Request status'), 'REJECTED');
  expect(screen.getByText('No allocation requests to show')).toBeInTheDocument();
});
it('shows load failures and recovers on refresh', async () => {
  server.use(
    http.get('/api/resources/board', () =>
      HttpResponse.json(
        { error: { code: 'UNAVAILABLE', message: 'Board unavailable' } },
        { status: 503 },
      ),
    ),
  );
  await open();
  await screen.findByText('Board unavailable');
  server.use(http.get('/api/resources/board', () => HttpResponse.json(board)));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByLabelText('Affected area')).toBeInTheDocument();
});
it('queues requests offline with their quantities and URL', async () => {
  await open();
  const user = await selectSupply();
  server.use(
    http.get('/api/resources/board', () => HttpResponse.error()),
    http.get('/api/resources/requirements/:id/resources', () => HttpResponse.error()),
  );
  await settle(() => setBrowserOnline(false));
  await user.type(screen.getByLabelText('Quantity to request'), '20');
  await user.click(screen.getByRole('button', { name: 'Send allocation request' }));
  expect(await screen.findByText(/Request saved on this device/)).toBeInTheDocument();
  const queued = await outbox.all('user-1');
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({
    body: { quantity: 20 },
    url: '/api/resources/allocation-requests',
  });
  await settle(() => undefined);
});
it('disables both owner response actions offline', async () => {
  board.requests = [pending];
  await open('NGO_MANAGER');
  await screen.findByRole('button', { name: 'Confirm allocation' });
  await settle(() => setBrowserOnline(false));
  expect(screen.getByRole('button', { name: 'Confirm allocation' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Decline request' })).toBeDisabled();
  expect(screen.getByText(/Reconnect and refresh/)).toBeInTheDocument();
  await settle(() => undefined);
});
it('queues an arrival offline and prevents a second click', async () => {
  board.dispatches = [
    {
      dispatchId: 'dispatch-1',
      requestId: pending.requestId,
      requirementId: needId,
      areaId: 'area-1',
      quantity: 50,
      status: 'DISPATCHED',
      dispatchedAt: pending.createdAt,
    },
  ];
  await open();
  await screen.findByRole('button', { name: 'Confirm Deployment' });
  await settle(() => setBrowserOnline(false));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm Deployment' }));
  expect(await screen.findByText(/Arrival confirmation saved on this device/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm Deployment' })).toBeDisabled();
  expect((await outbox.all('user-1'))[0]).toMatchObject({
    url: '/api/resources/dispatches/dispatch-1/deploy',
  });
  await settle(() => undefined);
});
it('shows a failed arrival without changing its dispatched status', async () => {
  board.dispatches = [
    {
      dispatchId: 'dispatch-1',
      requestId: pending.requestId,
      requirementId: needId,
      areaId: 'area-1',
      quantity: 50,
      status: 'DISPATCHED',
      dispatchedAt: pending.createdAt,
    },
  ];
  server.use(
    http.post('/api/resources/dispatches/:id/deploy', () =>
      HttpResponse.json(
        { error: { code: 'FORBIDDEN_SCOPE', message: 'Wrong district' } },
        { status: 403 },
      ),
    ),
  );
  await open();
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Confirm Deployment' }));
  expect(await screen.findByText('Wrong district')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm Deployment' })).toBeEnabled();
});
it('retries stock lookup after a search failure', async () => {
  server.use(
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json(
        { error: { code: 'UNAVAILABLE', message: 'Stock unavailable' } },
        { status: 503 },
      ),
    ),
  );
  await open();
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText('Affected area'), 'area-1');
  await user.selectOptions(screen.getByLabelText('Resource requirement'), needId);
  await screen.findByText('Stock unavailable');
  server.use(
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json({ resources: [supply] }),
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Retry stock search' }));
  expect(await screen.findByRole('option', { name: /Sri Lanka Red Cross/ })).toBeInTheDocument();
});
it('does not offer requirements whose outstanding quantity is fully held', async () => {
  board.needs[0]!.pendingQty = 100;
  await open();
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText('Affected area'), 'area-1');
  expect(screen.getByText(/All needs in this area/)).toBeInTheDocument();
});
it('formats safe fallbacks and clamps a fulfilled requirement', () => {
  expect(resourcesNav.roles).toContain('DMC_OFFICER');
  expect(label('DRY_RATIONS')).toBe('Dry rations');
  expect(errorMessage(new Error('retry'))).toBe('retry');
  expect(errorMessage(null)).toMatch(/try again/);
  expect(
    describeAllocation({ areas: [], needs: [], requests: [], dispatches: [] }, 'unknown'),
  ).toEqual({ category: 'Relief supply', area: 'unknown', unit: '' });
  expect(remaining({ ...board.needs[0]!, fulfilledQty: 120 })).toBe(0);
});
it('guards a programmatic form submission with an invalid quantity', async () => {
  await open();
  await selectSupply();
  const field = screen.getByLabelText('Quantity to request');
  fireEvent.change(field, { target: { value: '0' } });
  fireEvent.submit(field.closest('form')!);
  expect(await screen.findByText(/Choose available stock and a quantity/)).toBeInTheDocument();
});
it('shows the empty district state when no affected area is recorded', async () => {
  board.areas = [];
  board.needs = [];
  signIn(makeMe({ role: 'DISTRICT_OFFICER', district: undefined }));
  renderWithProviders(<ResourcesPage />);
  expect(await screen.findByText('No affected areas to show')).toBeInTheDocument();
});

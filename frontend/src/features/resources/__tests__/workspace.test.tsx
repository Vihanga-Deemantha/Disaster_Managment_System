import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ResourcesPage } from '..';
import { resourcePipeline, districtMetrics } from '../pipeline';
import { AreaRequirements } from '../AreaRequirements';
import { DistrictSituation } from '../DistrictSituation';
import { StatusBadge, AllocationList } from '../AllocationList';
import { ResourceSimulator } from '../ResourceSimulator';
import { renderWithProviders } from '@/shared/testing/render';
import { makeMe } from '@/shared/testing/fixtures';
import { signIn, resetBrowserOnline, settle, setBrowserOnline } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import type { Board, Supply } from '../types';

const area = {
  areaId: 'jaela',
  name: 'Ja-Ela Flood Site',
  district: 'GAMPAHA' as const,
  priority: 1,
  disasterEventId: 'flood-1',
  incidentId: 'incident-jaela',
};
const need = {
  requirementId: 'water-jaela',
  areaId: 'jaela',
  resourceType: 'RELIEF_SUPPLY' as const,
  category: 'WATER',
  unit: 'packs',
  requiredQty: 100,
  fulfilledQty: 0,
  pendingQty: 0,
};
const supply: Supply = {
  resourceId: 'stock-water',
  organizationId: 'org-red-cross',
  organizationName: 'Red Cross',
  organizationType: 'NGO',
  name: 'Water stock',
  category: 'WATER',
  unit: 'packs',
  status: 'AVAILABLE',
  availableQty: 60,
  reservedQty: 0,
  distanceKm: 4,
};
let board: Board;
beforeEach(() => {
  resetBrowserOnline();
  signIn(makeMe({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' }));
  board = { areas: [area], needs: [{ ...need }], requests: [], dispatches: [] };
  server.use(
    http.get('/api/resources/board', () => HttpResponse.json(board)),
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json({ resources: [supply] }),
    ),
    http.get('/api/resources/inventory', () => HttpResponse.json([])),
    http.get('/api/resources/notifications', () => HttpResponse.json([])),
    http.get('/api/hazard-reports/district/situation', () => HttpResponse.json([])),
    http.get('/api/warnings/district/situation', () => HttpResponse.json([])),
  );
  // jsdom does not implement native modal dialogs. The browser test checks actual focus behavior.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});

it('keeps confirmed shipments out of delivered fulfillment until deployment', () => {
  const committed = { ...need, fulfilledQty: 60, pendingQty: 10 };
  board.needs = [committed];
  board.dispatches = [
    {
      dispatchId: 'd1',
      requestId: 'r1',
      requirementId: need.requirementId,
      areaId: area.areaId,
      quantity: 60,
      status: 'DISPATCHED',
      dispatchedAt: new Date().toISOString(),
    },
  ];
  expect(resourcePipeline(committed, board)).toEqual({
    required: 100,
    delivered: 0,
    inTransit: 60,
    awaitingOwner: 10,
    unallocated: 30,
    unmet: 100,
  });
  board.dispatches[0]!.status = 'DEPLOYED';
  expect(resourcePipeline(committed, board)).toEqual({
    required: 100,
    delivered: 60,
    inTransit: 0,
    awaitingOwner: 10,
    unallocated: 30,
    unmet: 40,
  });
  expect(districtMetrics(board).fulfillment).toBe(60);
});
it('ignores historical reassigned shipments and avoids mixing units in district metrics', () => {
  board.dispatches = [
    {
      dispatchId: 'old',
      requestId: 'r1',
      requirementId: need.requirementId,
      areaId: area.areaId,
      quantity: 50,
      status: 'REASSIGNED',
      dispatchedAt: new Date().toISOString(),
    },
  ];
  board.needs.push({
    ...need,
    requirementId: 'team',
    category: 'MEDICAL',
    resourceType: 'RESCUE_TEAM',
    unit: 'teams',
    requiredQty: 1,
  });
  expect(resourcePipeline(need, board).inTransit).toBe(0);
  expect(districtMetrics(board).shortages).toBe(2);
});
it('uses amber for dispatched and rose for declined, with explicit status text', () => {
  renderWithProviders(
    <>
      <StatusBadge status="DISPATCHED" />
      <StatusBadge status="REJECTED" />
      <StatusBadge status="DEPLOYED" />
    </>,
  );
  expect(screen.getByText('In transit · pending arrival')).toHaveClass('bg-amber-50');
  expect(screen.getByText('Declined')).toHaveClass('bg-rose-50');
  expect(screen.getByText('Deployed / delivered')).toHaveClass('bg-emerald-50');
});
it('shows two locations together and keeps pipeline details compact until expanded', async () => {
  board.areas.push({ ...area, areaId: 'wattala', name: 'Wattala Lowland', priority: 2 });
  renderWithProviders(<AreaRequirements board={board} onAllocate={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Ja-Ela Flood Site' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Wattala Lowland' })).toBeInTheDocument();
  const toggle = screen.getByRole('button', { name: 'Pipeline details for Water' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await userEvent.setup().click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/100 packs still needed on site/)).toBeInTheDocument();
});
it('maps incident cards only through explicit identifiers and distinguishes same-hazard sites', async () => {
  board.areas.push({
    ...area,
    areaId: 'wattala',
    name: 'Wattala Lowland',
    incidentId: 'incident-wattala',
  });
  const issue = {
    dominantHazardType: 'FLOOD',
    band: 'HIGH',
    priorityScore: 80,
    status: 'OPEN',
    counts: { total: 2, pending: 1, verified: 1, rejected: 0 },
    lastReportAt: new Date().toISOString(),
    centroid: { lat: 7.1, lng: 79.9 },
  };
  server.use(
    http.get('/api/hazard-reports/district/situation', () =>
      HttpResponse.json([
        { ...issue, id: 'incident-jaela' },
        { ...issue, id: 'incident-wattala' },
      ]),
    ),
  );
  const allocate = vi.fn();
  renderWithProviders(<DistrictSituation district="GAMPAHA" board={board} onAllocate={allocate} />);
  const card = (await screen.findByRole('heading', { name: 'Wattala Lowland' })).closest(
    'article',
  )!;
  await userEvent
    .setup()
    .click(within(card).getByRole('button', { name: 'View & Allocate Requirements' }));
  expect(allocate).toHaveBeenCalledWith('wattala');
});
it('sends from the drawer, exposes owner demo actions, confirms and records arrival', async () => {
  const sent: unknown[] = [];
  server.use(
    http.post('/api/resources/allocation-requests', async ({ request }) => {
      sent.push(await request.json());
      expect(request.headers.get('X-Requested-With')).toBe('SafeZone');
      expect(request.headers.get('Idempotency-Key')).toBeTruthy();
      board.needs[0]!.pendingQty = 60;
      board.requests = [
        {
          requestId: 'r1',
          requirementId: need.requirementId,
          resourceId: supply.resourceId,
          organizationId: supply.organizationId,
          requestedQty: 60,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          respondBy: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      ];
      return HttpResponse.json(board.requests[0], { status: 201 });
    }),
    http.post('/api/resources/dev/requests/r1/respond', async ({ request }) => {
      sent.push(await request.json());
      board.requests[0]!.status = 'CONFIRMED';
      board.requests[0]!.confirmedQty = 60;
      board.needs[0]!.fulfilledQty = 60;
      board.needs[0]!.pendingQty = 0;
      board.dispatches = [
        {
          dispatchId: 'd1',
          requestId: 'r1',
          requirementId: need.requirementId,
          areaId: area.areaId,
          quantity: 60,
          status: 'DISPATCHED',
          dispatchedAt: new Date().toISOString(),
        },
      ];
      return HttpResponse.json({});
    }),
    http.post('/api/resources/dispatches/d1/deploy', () => {
      board.dispatches[0]!.status = 'DEPLOYED';
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(<ResourcesPage />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Allocate Resources' }));
  const drawer = screen.getByRole('dialog', { name: 'Multi-Agency Stock Matcher' });
  await user.click(await within(drawer).findByRole('button', { name: 'Send Allocation Request' }));
  await user.click(
    await within(drawer).findByRole('button', { name: 'View requests · Demo Accept / Reject' }),
  );
  const accept = await screen.findByRole('button', { name: 'Demo Accept' });
  await waitFor(() => expect(accept).toBeEnabled());
  await user.click(accept);
  await screen.findByText('Confirmed 60 packs');
  await user.click(screen.getByRole('tab', { name: 'Dispatches & Arrivals' }));
  await user.click(await screen.findByRole('button', { name: 'Confirm Deployment' }));
  await screen.findByText('Deployment confirmed. Delivered fulfillment has been updated.');
  expect(sent).toEqual([
    { requirementId: need.requirementId, resourceId: supply.resourceId, quantity: 60 },
    { quantity: 60 },
  ]);
  await waitFor(() =>
    expect(screen.getByLabelText('Delivered fulfillment')).toHaveAttribute('value', '60'),
  );
});
it('does not permit simulated responses offline and validates rejection reasons', async () => {
  board.requests = [
    {
      requestId: 'r1',
      requirementId: need.requirementId,
      resourceId: supply.resourceId,
      organizationId: supply.organizationId,
      requestedQty: 60,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      respondBy: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
  ];
  renderWithProviders(<AllocationList board={board} owner={false} fresh onSaved={vi.fn()} />);
  const reject = await screen.findByRole('button', { name: 'Demo Reject' });
  await userEvent.setup().click(reject);
  expect(await screen.findByText('Enter a reason for declining.')).toBeInTheDocument();
  await settle(() => setBrowserOnline(false));
  expect(reject).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Demo Accept' })).toBeDisabled();
});
it('allows an anonymous evaluator to add a medical team through the local simulator', async () => {
  server.use(
    http.get('/api/auth/me', () =>
      HttpResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Sign in' } },
        { status: 401 },
      ),
    ),
    http.get('/api/resources/dev/simulator/state', () =>
      HttpResponse.json({ ...board, inventory: [] }),
    ),
  );
  let sent: unknown;
  server.use(
    http.post('/api/resources/dev/simulator/inventory', async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({}, { status: 201 });
    }),
  );
  renderWithProviders(<ResourceSimulator />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Resource / team / shelter name'), 'Ja-Ela medical team');
  await user.selectOptions(screen.getByLabelText('Resource template'), '4');
  await user.click(screen.getByRole('button', { name: 'Add to demo dataset' }));
  await screen.findByText('Saved. The district workspace will refresh automatically.');
  expect(sent).toMatchObject({
    name: 'Ja-Ela medical team',
    resourceType: 'RESCUE_TEAM',
    category: 'MEDICAL',
    unit: 'teams',
    quantity: 1,
    teamType: 'MEDICAL',
    teamSize: 8,
  });
});

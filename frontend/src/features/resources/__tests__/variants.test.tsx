import { within } from '@testing-library/react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/shared/testing/render';
import { makeMe } from '@/shared/testing/fixtures';
import { signIn, resetBrowserOnline, setBrowserOnline, settle } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { AreaRequirements } from '../AreaRequirements';
import { RequestForm } from '../RequestForm';
import { DispatchActions, reassignmentTargets } from '../DispatchActions';
import { DispatchList } from '../DispatchList';
import { PartnerDemoControls, DemoExpiry, RequestDemoExpiry } from '../DemoControls';
import type { Board, Supply, Dispatch } from '../types';

let board: Board;
const supply: Supply = {
  resourceId: 'stock',
  organizationId: 'org-red-cross',
  organizationName: 'Red Cross',
  organizationType: 'NGO',
  category: 'WATER',
  unit: 'packs',
  status: 'AVAILABLE',
  availableQty: 15,
  reservedQty: 0,
  name: 'Partial stock',
  distanceKm: 12.5,
};
const dispatch: Dispatch = {
  dispatchId: 'delivery',
  requestId: 'request',
  requirementId: 'source-need',
  areaId: 'source',
  quantity: 20,
  status: 'DISPATCHED',
  dispatchedAt: '2026-10-09T00:00:00Z',
};
beforeEach(() => {
  resetBrowserOnline();
  signIn(makeMe({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' }));
  board = {
    areas: [
      {
        areaId: 'source',
        name: 'Ja-Ela relief point',
        district: 'GAMPAHA',
        priority: 3,
        disasterEventId: 'flood',
      },
      {
        areaId: 'urgent',
        name: 'Kelaniya evacuation point',
        district: 'GAMPAHA',
        priority: 1,
        disasterEventId: 'flood',
      },
      {
        areaId: 'low',
        name: 'Low priority point',
        district: 'GAMPAHA',
        priority: 4,
        disasterEventId: 'flood',
      },
    ],
    needs: ['source', 'urgent', 'low'].map((areaId) => ({
      requirementId: `${areaId}-need`,
      areaId,
      category: 'WATER',
      unit: 'packs',
      resourceType: 'RELIEF_SUPPLY',
      requiredQty: 100,
      fulfilledQty: areaId === 'source' ? 20 : 0,
      pendingQty: 0,
    })),
    requests: [],
    dispatches: [],
  };
  server.use(
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json({ resources: [supply] }),
    ),
  );
});
async function selectStock() {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Affected area'), 'source');
  await user.selectOptions(screen.getByLabelText('Resource requirement'), 'source-need');
  await screen.findByRole('option', { name: /Red Cross/ });
  await user.selectOptions(screen.getByLabelText('Resource owner'), 'stock');
  return user;
}

it('shows multiple sites together and allocates from the selected card', async () => {
  const allocate = vi.fn();
  renderWithProviders(<AreaRequirements board={board} onAllocate={allocate} />);
  expect(screen.getByRole('heading', { name: 'Kelaniya evacuation point' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Ja-Ela relief point' })).toBeInTheDocument();
  const user = userEvent.setup();
  const card = screen.getByRole('heading', { name: 'Ja-Ela relief point' }).closest('article')!;
  await user.click(within(card).getByRole('button', { name: 'Allocate Resources' }));
  expect(allocate).toHaveBeenCalledWith('source');
});
it('UC-2 HCI-03: leaves observer requirements read-only and handles an empty district', () => {
  const rendered = renderWithProviders(<AreaRequirements board={board} />);
  expect(screen.queryByRole('button', { name: 'Allocate Resources' })).not.toBeInTheDocument();
  rendered.unmount();
  renderWithProviders(<AreaRequirements board={{ ...board, areas: [] }} />);
  expect(screen.getByRole('heading', { name: 'No affected areas to show' })).toBeInTheDocument();
});
it('UC-2 A1: asks consent for the available quantity, allows cancel and sends explicit partial acceptance', async () => {
  const saved = vi.fn();
  let body: unknown;
  let count = 0;
  server.use(
    http.post('/api/resources/allocation-requests', async ({ request }) => {
      count++;
      body = await request.json();
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(<RequestForm board={board} onSaved={saved} />);
  const user = await selectStock();
  expect(screen.getByText(/12.5 km away/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('Quantity to request'), '50');
  await user.click(screen.getByRole('button', { name: 'Send allocation request' }));
  expect(screen.getByRole('alertdialog', { name: 'Partial allocation' })).toHaveTextContent(
    'Only 15 available · shortfall 35',
  );
  expect(count).toBe(0);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Send allocation request' }));
  await user.click(screen.getByRole('button', { name: 'Accept partial allocation' }));
  await screen.findByText(/Request sent/);
  expect(body).toEqual({
    requirementId: 'source-need',
    resourceId: 'stock',
    quantity: 50,
    acceptPartial: true,
  });
  expect(saved).toHaveBeenCalledTimes(1);
});
it('UC-2 A1/E4: offers the latest shortfall returned by the server when stock changes meanwhile', async () => {
  server.use(
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json({ resources: [{ ...supply, availableQty: 100 }] }),
    ),
    http.post('/api/resources/allocation-requests', () =>
      HttpResponse.json(
        {
          error: {
            code: 'INSUFFICIENT_QUANTITY',
            message: 'Stock changed',
            details: { available: 5, shortfall: 45 },
          },
        },
        { status: 409 },
      ),
    ),
  );
  renderWithProviders(<RequestForm board={board} onSaved={vi.fn()} />);
  const user = await selectStock();
  await user.type(screen.getByLabelText('Quantity to request'), '50');
  await user.click(screen.getByRole('button', { name: 'Send allocation request' }));
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(
    'Only 5 available · shortfall 45',
  );
});
it('UC-2 E3: stale stock stays visible but cannot be selected or requested', async () => {
  server.use(
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json({ resources: [{ ...supply, status: 'UNKNOWN' }] }),
    ),
  );
  renderWithProviders(<RequestForm board={board} onSaved={vi.fn()} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Affected area'), 'source');
  await user.selectOptions(screen.getByLabelText('Resource requirement'), 'source-need');
  expect(await screen.findByRole('option', { name: /Status unknown/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Resource owner'), { target: { value: 'stock' } });
  fireEvent.change(screen.getByLabelText('Quantity to request'), { target: { value: '2' } });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Send allocation request' }).closest('form')!,
  );
  expect(await screen.findByText(/Choose available stock/)).toBeInTheDocument();
});
it('UC-2 A5: records a failed delivery with a reason and confirmation; retry uses the same operation key', async () => {
  const saved = vi.fn();
  const keys: (string | null)[] = [];
  let body: unknown;
  server.use(
    http.post('/api/resources/dispatches/delivery/distribution-failed', async ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key'));
      body = await request.json();
      return keys.length === 1
        ? HttpResponse.json({ error: { code: 'TRY_AGAIN', message: 'Try again' } }, { status: 503 })
        : HttpResponse.json({});
    }),
  );
  renderWithProviders(<DispatchActions board={board} dispatch={dispatch} onSaved={saved} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Report delivery failure' }));
  fireEvent.submit(screen.getByRole('dialog'));
  expect(await screen.findByText(/Enter a reason/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('Reason for delivery change'), 'Road flooded');
  await user.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Try again');
  await user.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Delivery updated.');
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(body).toEqual({ reason: 'Road flooded' });
  expect(saved).toHaveBeenCalledTimes(1);
});
it('UC-2 A5: reschedules only distribution pending and confirms the attempt', async () => {
  let body: unknown;
  server.use(
    http.post('/api/resources/dispatches/delivery/reschedule', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(
    <DispatchActions
      board={board}
      dispatch={{ ...dispatch, status: 'DISTRIBUTION_PENDING' }}
      onSaved={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reschedule delivery' }));
  expect(screen.getByText('Confirm another delivery attempt?')).toBeInTheDocument();
  expect(screen.queryByLabelText('Reason for delivery change')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Reschedule delivery' }));
  await user.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Delivery updated.');
  expect(body).toEqual({});
});
it('UC-2 A3: offers matching higher-priority destinations and records the new destination and reason', async () => {
  let body: unknown;
  server.use(
    http.post('/api/resources/dispatches/delivery/reassign', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(<DispatchActions board={board} dispatch={dispatch} onSaved={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reassign to priority area' }));
  expect(screen.queryByRole('option', { name: /Low priority/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Higher-priority area'), 'urgent');
  await user.type(screen.getByLabelText('Reason for delivery change'), 'Urgent evacuation');
  await user.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Delivery updated.');
  expect(body).toEqual({ targetAreaId: 'urgent', reason: 'Urgent evacuation' });
});
it('UC-2 A3: explains no matching destination and refuses edits while offline or after arrival', async () => {
  const rendered = renderWithProviders(
    <DispatchActions board={{ ...board, needs: [] }} dispatch={dispatch} onSaved={vi.fn()} />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reassign to priority area' }));
  expect(screen.getByText(/No higher-priority area/)).toBeInTheDocument();
  await settle(() => setBrowserOnline(false));
  expect(screen.getByRole('button', { name: 'Confirm change' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('dialog'));
  expect(screen.getByText(/Reconnect before changing/)).toBeInTheDocument();
  rendered.unmount();
  renderWithProviders(
    <DispatchActions
      board={board}
      dispatch={{ ...dispatch, status: 'DEPLOYED' }}
      onSaved={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: /Reassign/ })).not.toBeInTheDocument();
});
it('UC-2 A3: excludes other districts, events, units, types and insufficient outstanding quantities', () => {
  expect(reassignmentTargets(board, dispatch).map((a) => a.areaId)).toEqual(['urgent']);
  for (const patch of [{ district: 'COLOMBO' as const }, { disasterEventId: 'other' }]) {
    expect(
      reassignmentTargets(
        {
          ...board,
          areas: board.areas.map((a) => (a.areaId === 'urgent' ? { ...a, ...patch } : a)),
        },
        dispatch,
      ),
    ).toHaveLength(0);
  }
  for (const patch of [
    { unit: 'litres' },
    { category: 'MEDICAL' },
    { resourceType: 'SHELTER' as const },
    { pendingQty: 90 },
  ]) {
    expect(
      reassignmentTargets(
        {
          ...board,
          needs: board.needs.map((n) => (n.areaId === 'urgent' ? { ...n, ...patch } : n)),
        },
        dispatch,
      ),
    ).toHaveLength(0);
  }
  expect(reassignmentTargets(board, { ...dispatch, areaId: 'missing' })).toHaveLength(0);
  expect(reassignmentTargets(board, { ...dispatch, requirementId: 'missing' })).toHaveLength(0);
});
it('UC-2 A5: displays delivery reasons and history without exposing edit actions to observers', () => {
  board.dispatches = [
    {
      ...dispatch,
      status: 'DISTRIBUTION_PENDING',
      reason: 'Road flooded',
      history: [
        { action: 'failed', actorId: 'officer', at: dispatch.dispatchedAt, reason: 'Road flooded' },
        { action: 'rescheduled', actorId: 'officer', at: dispatch.dispatchedAt },
      ],
    },
  ];
  renderWithProviders(<DispatchList board={board} officer={false} onSaved={vi.fn()} />);
  expect(screen.getByText('Delivery delayed')).toBeInTheDocument();
  expect(screen.getByText('Reason: Road flooded')).toBeInTheDocument();
  expect(screen.getByText('Delivery history')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm arrival' })).not.toBeInTheDocument();
});
it('UC-2 E3: DMC can switch simulated partner modes and sees errors and successful recovery', async () => {
  let payload: unknown;
  let calls = 0;
  server.use(
    http.put('/api/resources/dev/partners/:id/mode', async ({ request }) => {
      payload = await request.json();
      calls++;
      return calls === 1
        ? HttpResponse.json(
            { error: { code: 'DOWN', message: 'Feed update failed' } },
            { status: 503 },
          )
        : HttpResponse.json({});
    }),
  );
  renderWithProviders(<PartnerDemoControls />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Demo partner'), 'org-sl-army');
  await user.selectOptions(screen.getByLabelText('Feed mode'), 'DOWN');
  await user.click(screen.getByRole('button', { name: 'Apply demo mode' }));
  await screen.findByText('Feed update failed');
  await user.selectOptions(screen.getByLabelText('Feed mode'), 'OK');
  await user.click(screen.getByRole('button', { name: 'Apply demo mode' }));
  await screen.findByText(/Demo partner mode set to OK/);
  expect(payload).toEqual({ mode: 'OK' });
  await settle(() => setBrowserOnline(false));
  expect(screen.getByRole('button', { name: 'Apply demo mode' })).toBeDisabled();
});
it('UC-2 E1: the demo expiry releases a pending request after a retry and is disabled offline', async () => {
  let calls = 0;
  const saved = vi.fn();
  server.use(
    http.post('/api/resources/dev/requests/request/expire', () => {
      calls++;
      return calls === 1
        ? HttpResponse.json({ error: { code: 'FAIL', message: 'Expiry failed' } }, { status: 503 })
        : HttpResponse.json({});
    }),
  );
  renderWithProviders(<DemoExpiry requestId="request" onSaved={saved} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /simulate no response/ }));
  await screen.findByText('Expiry failed');
  await user.click(screen.getByRole('button', { name: /simulate no response/ }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: /simulate no response/ })).toBeDisabled();
});
it('UC-2 E1: never exposes the expiry demo action to an owner or a stale board', () => {
  const request = {
    requestId: 'r',
    requirementId: 'n',
    resourceId: 'i',
    organizationId: 'org-red-cross',
    requestedQty: 1,
    status: 'PENDING' as const,
    respondBy: '',
    createdAt: '',
  };
  signIn(makeMe({ role: 'NGO_MANAGER', organizationId: 'org-red-cross' }));
  const rendered = renderWithProviders(
    <RequestDemoExpiry request={request} fresh onSaved={vi.fn()} />,
  );
  expect(screen.queryByRole('button', { name: /simulate/ })).not.toBeInTheDocument();
  rendered.unmount();
  signIn(makeMe({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' }));
  renderWithProviders(<RequestDemoExpiry request={request} fresh={false} onSaved={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /simulate/ })).not.toBeInTheDocument();
});

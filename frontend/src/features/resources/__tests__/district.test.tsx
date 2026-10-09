import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/shared/testing/render';
import { signIn, resetBrowserOnline, setBrowserOnline, settle } from '@/shared/testing/auth';
import { makeMe } from '@/shared/testing/fixtures';
import { server } from '@/shared/testing/server';
import { DistrictSituation } from '../DistrictSituation';
import { FieldResources } from '../FieldResources';
import { ResourceUpdate } from '../ResourceUpdate';
import { RequestForm } from '../RequestForm';
import type { Supply, Board } from '../types';

const now = '2026-10-09T00:00:00Z';
const team: Supply = {
  resourceId: 'team-1',
  name: 'Army unit 1',
  resourceType: 'RESCUE_TEAM',
  organizationId: 'org-army',
  organizationName: 'Army',
  organizationType: 'ARMED_FORCES',
  category: 'ARMY',
  unit: 'teams',
  status: 'AVAILABLE',
  availableQty: 1,
  reservedQty: 0,
  teamSize: 12,
  lastUpdatedAt: now,
  lastSyncedAt: now,
  location: { lat: 7, lng: 80 },
};
const shelter: Supply = {
  ...team,
  resourceId: 'shelter-1',
  name: 'Gampaha shelter',
  resourceType: 'SHELTER',
  district: 'GAMPAHA',
  category: 'EVACUATION_SHELTER',
  unit: 'places',
  capacity: 100,
  currentOccupancy: 20,
  committedQty: 10,
  availableQty: 70,
};
beforeEach(() => {
  resetBrowserOnline();
  signIn(makeMe({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' }));
  server.use(
    http.get('/api/resources/inventory', () => HttpResponse.json([team, shelter])),
    http.get('/api/hazard-reports/district/situation', () => HttpResponse.json([])),
    http.get('/api/warnings/district/situation', () => HttpResponse.json([])),
  );
});
it('shows reported priority, verification counts and official warnings with separate validity', async () => {
  server.use(
    http.get('/api/hazard-reports/district/situation', () =>
      HttpResponse.json([
        {
          id: 'issue-1',
          dominantHazardType: 'FLOOD',
          band: 'HIGH',
          priorityScore: 80,
          status: 'ESCALATED',
          counts: { total: 10, pending: 3, verified: 6, rejected: 1 },
          lastReportAt: now,
        },
      ]),
    ),
    http.get('/api/warnings/district/situation', () =>
      HttpResponse.json([
        {
          warningId: 'w1',
          hazardType: 'FLOOD',
          severity: 'HIGH',
          messages: { EN: 'Move to higher ground.' },
          targetAreas: [{ areaId: 'a1', name: 'Gampaha' }],
          validTo: now,
        },
      ]),
    ),
  );
  renderWithProviders(<DistrictSituation district="GAMPAHA" />);
  expect(await screen.findByText(/3 reports awaiting verification/)).toBeInTheDocument();
  expect(await screen.findByText('Move to higher ground.')).toBeInTheDocument();
  expect(screen.getByText(/High reported priority/)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh situation' }));
  expect(await screen.findAllByText(/6 verified/)).toHaveLength(2);
});
it('keeps the other situation feed usable when one fails, and retries it', async () => {
  server.use(
    http.get('/api/warnings/district/situation', () =>
      HttpResponse.json(
        { error: { code: 'DOWN', message: 'Warning feed unavailable' } },
        { status: 503 },
      ),
    ),
  );
  renderWithProviders(<DistrictSituation district="GAMPAHA" />);
  expect(await screen.findByText('Warning feed unavailable')).toBeInTheDocument();
  expect(await screen.findByText(/No open incident groups recorded/)).toBeInTheDocument();
  server.use(http.get('/api/warnings/district/situation', () => HttpResponse.json([])));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry situation feed' }));
  expect(await screen.findByText(/No currently valid issued warnings/)).toBeInTheDocument();
});
it('labels saved situation feeds when offline', async () => {
  renderWithProviders(<DistrictSituation district="GAMPAHA" />);
  await screen.findByText(/No currently valid issued warnings/);
  await screen.findByText(/No open incident groups recorded/);
  server.use(
    http.get('/api/warnings/district/situation', () => HttpResponse.error()),
    http.get('/api/hazard-reports/district/situation', () => HttpResponse.error()),
  );
  await settle(() => setBrowserOnline(false));
  expect(await screen.findAllByText(/Saved situation data/)).toHaveLength(2);
});
it('lists teams and shelter occupancy read only for district officers', async () => {
  renderWithProviders(<FieldResources owner={false} />);
  expect(await screen.findByText('Army unit 1')).toBeInTheDocument();
  expect(screen.getByLabelText('Occupancy at Gampaha shelter')).toHaveAttribute('value', '20');
  expect(screen.queryByRole('button', { name: 'Update team status' })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh field resources' }));
  expect(await screen.findByText(/12 team members/)).toBeInTheDocument();
});
it('handles empty inventory, load errors and cached field inventory', async () => {
  server.use(http.get('/api/resources/inventory', () => HttpResponse.json([])));
  renderWithProviders(<FieldResources owner={false} />);
  await screen.findByText(/No rescue teams or shelters/);
  server.use(
    http.get('/api/resources/inventory', () =>
      HttpResponse.json(
        { error: { code: 'DOWN', message: 'Inventory unavailable' } },
        { status: 503 },
      ),
    ),
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh field resources' }));
  await screen.findByText('Inventory unavailable');
  server.use(http.get('/api/resources/inventory', () => HttpResponse.error()));
  await settle(() => setBrowserOnline(false));
  expect(await screen.findByText(/Saved team availability/)).toBeInTheDocument();
});
it('lets an owner update a team status and location, preserving keys on retries', async () => {
  const keys: string[] = [];
  let sent: unknown;
  server.use(
    http.post('/api/resources/inventory/:id/team-status', async ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!);
      sent = await request.json();
      return keys.length === 1
        ? HttpResponse.json(
            { error: { code: 'DOWN', message: 'Retry team update' } },
            { status: 503 },
          )
        : HttpResponse.json({});
    }),
  );
  renderWithProviders(<ResourceUpdate item={team} fresh onSaved={() => undefined} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Team status for Army unit 1'), 'UNAVAILABLE');
  await user.clear(screen.getByLabelText('Latitude for Army unit 1'));
  await user.type(screen.getByLabelText('Latitude for Army unit 1'), '7.2');
  await user.clear(screen.getByLabelText('Longitude for Army unit 1'));
  await user.type(screen.getByLabelText('Longitude for Army unit 1'), '80.2');
  await user.click(screen.getByRole('button', { name: 'Update team status' }));
  await screen.findByText('Retry team update');
  await user.click(screen.getByRole('button', { name: 'Update team status' }));
  expect(await screen.findByText('Field resource updated.')).toBeInTheDocument();
  expect(sent).toEqual({ status: 'UNAVAILABLE', location: { lat: 7.2, lng: 80.2 } });
  expect(keys[0]).toBe(keys[1]);
});
it('lets owners update shelter occupancy and disables changes while offline', async () => {
  let sent: unknown;
  server.use(
    http.post('/api/resources/inventory/:id/occupancy', async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(<FieldResources owner />);
  const user = userEvent.setup();
  const field = await screen.findByLabelText('Current occupancy at Gampaha shelter');
  await user.clear(field);
  await user.type(field, '30');
  await user.click(screen.getByRole('button', { name: 'Update shelter occupancy' }));
  expect(await screen.findByText('Field resource updated.')).toBeInTheDocument();
  expect(sent).toEqual({ occupancy: 30 });
  await settle(() => setBrowserOnline(false));
  expect(screen.getByRole('button', { name: 'Update team status' })).toBeDisabled();
});
it('shows sparse field metadata and guards stale programmatic submissions', async () => {
  server.use(
    http.get('/api/resources/inventory', () =>
      HttpResponse.json([
        {
          ...team,
          name: undefined,
          lastUpdatedAt: undefined,
          location: undefined,
          availableQty: 0,
        },
        { ...shelter, name: undefined, district: undefined },
      ]),
    ),
  );
  renderWithProviders(<FieldResources owner />);
  expect(await screen.findByText('Army')).toBeInTheDocument();
  expect(await screen.findByText(/Assigned or unavailable/)).toBeInTheDocument();
  await settle(() => setBrowserOnline(false));
  const field = screen.getByLabelText('Latitude for undefined');
  fireEvent.submit(field.closest('form')!);
  expect(screen.getByRole('button', { name: 'Update team status' })).toBeDisabled();
});
it('offers whole units for rescue teams and shelters in the request form', async () => {
  const board: Board = {
    areas: [
      { areaId: 'a1', district: 'GAMPAHA', name: 'Flood area', priority: 1, disasterEventId: 'e1' },
    ],
    needs: [
      {
        requirementId: 'n1',
        areaId: 'a1',
        resourceType: 'RESCUE_TEAM',
        category: 'ARMY',
        unit: 'teams',
        requiredQty: 1,
        fulfilledQty: 0,
        pendingQty: 0,
      },
    ],
    requests: [],
    dispatches: [],
  };
  server.use(
    http.get('/api/resources/requirements/:id/resources', () =>
      HttpResponse.json({ resources: [team] }),
    ),
  );
  renderWithProviders(<RequestForm board={board} onSaved={() => undefined} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Affected area'), 'a1');
  await user.selectOptions(screen.getByLabelText('Resource requirement'), 'n1');
  await screen.findByRole('option', { name: /Army unit 1/ });
  await user.selectOptions(screen.getByLabelText('Resource owner'), 'team-1');
  expect(screen.getByLabelText('Quantity to request')).toHaveAttribute('step', '1');
  await waitFor(() =>
    expect(screen.getByLabelText('Quantity to request')).toHaveAttribute('max', '1'),
  );
});

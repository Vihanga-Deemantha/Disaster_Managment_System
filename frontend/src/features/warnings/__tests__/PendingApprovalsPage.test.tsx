import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { cacheWrite } from '@/shared/offline/cache';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { aBasin, aWarning, hoursAgo, json } from '../testing/fixtures';
import { renderWarnings, serveWarnings } from '../testing/render';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

afterEach(() => resetBrowserOnline());
beforeEach(() => signIn(makeMe({ userId: 'user-1' })));

const heading = () => screen.findByRole('heading', { level: 1, name: 'Pending Approvals' });
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

const LIST = [
  aWarning({ warningId: 'W-1', hazardType: 'FLOOD', severity: 'HIGH', submittedAt: hoursAgo(1) }),
  aWarning({
    warningId: 'W-2',
    hazardType: 'LANDSLIDE',
    severity: 'CRITICAL',
    submittedAt: hoursAgo(5),
    targetAreas: [aBasin()],
  }),
  aWarning({ warningId: 'W-3', hazardType: 'FLOOD', severity: 'LOW', submittedAt: hoursAgo(2) }),
];

describe('UC-1 step 1: Pending Approvals (screen 1)', () => {
  it('shows a spinner while the list loads, then the warnings in the order the server sent them', async () => {
    serveWarnings({ list: LIST });

    renderWarnings();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await heading()).toBeInTheDocument();
    await screen.findByRole('table');
    expect(rows()).toHaveLength(3);
    expect(rows()[0]).toHaveTextContent('Flood');
    expect(rows()[0]).toHaveTextContent('Gampaha');
    expect(rows()[0]).toHaveTextContent('District');
    expect(rows()[1]).toHaveTextContent('Landslide');
    expect(rows()[1]).toHaveTextContent('Kelani Ganga basin');
    expect(rows()[1]).toHaveTextContent('River basin');
  });

  it('asks the server only for the warnings waiting for approval', async () => {
    let status: string | null = null;
    server.use(
      http.get('/api/warnings', ({ request }) => {
        status = new URL(request.url).searchParams.get('status');
        return json([]);
      }),
    );

    renderWarnings();

    await screen.findByText('Nothing is waiting for approval right now.');
    expect(status).toBe('PENDING_APPROVAL');
  });

  it('shows how many are waiting, how many are urgent, and how long the longest has waited', async () => {
    serveWarnings({ list: LIST });

    renderWarnings();

    const stats = await screen.findByText('Waiting for approval');
    const cards = stats.closest('dl') as HTMLElement;
    expect(within(cards).getByText('Waiting for approval').nextSibling).toHaveTextContent('3');
    expect(within(cards).getByText('Critical or high severity').nextSibling).toHaveTextContent('2');
    expect(within(cards).getByText('Waiting longest').nextSibling).toHaveTextContent(/5 hours ago/);
  });

  it('marks severity in words as well as colour', async () => {
    serveWarnings({ list: LIST });

    renderWarnings();

    await screen.findByRole('table');
    expect(rows()[0]).toHaveTextContent('High');
    expect(rows()[1]).toHaveTextContent('Critical');
    expect(rows()[2]).toHaveTextContent('Low');
  });

  it('filters by hazard, and goes back to everything with All', async () => {
    serveWarnings({ list: LIST });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');

    const flood = screen.getByRole('button', { name: 'Flood (2)' });
    expect(screen.getByRole('button', { name: 'All hazards (3)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: /Drought/ })).not.toBeInTheDocument();

    await user.click(flood);
    expect(flood).toHaveAttribute('aria-pressed', 'true');
    expect(rows()).toHaveLength(2);
    expect(rows().every((row) => /Flood/.test(row.textContent ?? ''))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Landslide (1)' }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('Landslide');

    await user.click(screen.getByRole('button', { name: 'All hazards (3)' }));
    expect(rows()).toHaveLength(3);
  });

  it('has a Review link on every row that says which warning it opens', async () => {
    serveWarnings({ list: LIST });
    const user = userEvent.setup();
    const view = renderWarnings();
    await screen.findByRole('table');

    await user.click(
      screen.getByRole('link', { name: 'Review the Landslide warning for Kelani Ganga basin' }),
    );

    expect(view.router.state.location.pathname).toBe('/warnings/W-2');
  });

  it('says so plainly when nothing is waiting, without cards or tabs', async () => {
    serveWarnings({ list: [] });

    renderWarnings();

    expect(
      await screen.findByText('Nothing is waiting for approval right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Show warnings for' })).not.toBeInTheDocument();
  });

  it('explains a failure in words and offers to try again', async () => {
    let calls = 0;
    server.use(
      http.get('/api/warnings', () => {
        calls += 1;
        return calls === 1 ? apiError(500, 'INTERNAL_ERROR') : json(LIST);
      }),
    );
    const user = userEvent.setup();
    renderWarnings();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is written in Sinhala when the interface is', async () => {
    serveWarnings({ list: LIST });

    renderWarnings('/warnings', { language: 'SI' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'අනුමැතිය බලාපොරොත්තු වන ඒවා' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'ගංවතුර (2)' })).toBeInTheDocument();
  });
});

describe('UC-1 BR6: Pending Approvals offline', () => {
  it('shows the saved copy, and when it was last synced, when the network is down', async () => {
    await cacheWrite('user-1', 'warnings', 'pending-list', LIST, { now: Date.now() - 3_600_000 });
    server.use(http.get('/api/warnings', () => HttpResponse.error()));
    setBrowserOnline(false);

    renderWarnings();

    await screen.findByRole('table');
    expect(rows()).toHaveLength(3);
    expect(screen.getByText(/Last synced/)).toHaveTextContent('1 hour ago');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps showing the saved copy next to the error when the server itself fails', async () => {
    await cacheWrite('user-1', 'warnings', 'pending-list', LIST, { now: Date.now() - 60_000 });
    server.use(http.get('/api/warnings', () => apiError(500, 'INTERNAL_ERROR')));

    renderWarnings();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(rows()).toHaveLength(3);
  });
});

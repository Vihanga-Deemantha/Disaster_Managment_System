import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { cacheWrite } from '@/shared/offline/cache';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { aBasin, aWarning, hoursAgo, json } from '../testing/fixtures';
import { renderWarnings, serveWarnings } from '../testing/render';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

/** Midday on a fixed day, so "today", "last 24 hours" and "5 hours ago" mean the same on every run. */
const NOW = new Date(2026, 9, 8, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  signIn(makeMe({ userId: 'user-1' }));
});
afterEach(() => {
  vi.useRealTimers();
  resetBrowserOnline();
});

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);
/** The warning ids in the order the rows are shown, read from the link at the end of each row. */
const order = () =>
  rows().map((row) =>
    (within(row).getByRole('link').getAttribute('href') as string)
      .replace('/warnings/', '')
      .replace('/delivery', ''),
  );
/** The paragraphs of a card: the number, what it counts, and the short note under it. */
const stat = (name: string) =>
  [...screen.getByRole('group', { name }).querySelectorAll('p')].map((p) => p.textContent);

const list = () => [
  aWarning({
    warningId: 'W-1',
    hazardType: 'FLOOD',
    severity: 'HIGH',
    submittedAt: hoursAgo(1),
    submittedByName: 'Nimali Perera',
  }),
  aWarning({
    warningId: 'W-2',
    hazardType: 'LANDSLIDE',
    severity: 'CRITICAL',
    submittedAt: hoursAgo(5),
    targetAreas: [aBasin()],
    submittedBy: 'usr-duty-2',
    submittedByName: 'Kasun Silva',
  }),
  aWarning({
    warningId: 'W-3',
    hazardType: 'FLOOD',
    severity: 'LOW',
    submittedAt: hoursAgo(2),
    submittedByName: 'Nimali Perera',
  }),
];

describe('UC-1 step 1: Pending Approvals (screen 1)', () => {
  it('shows the title at once, a spinner while the list loads, then the warnings newest first', async () => {
    serveWarnings({ list: list() });

    renderWarnings();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Pending Approvals' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Review warning requests from approved reports and officer submissions.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await screen.findByRole('table');
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(order()).toEqual(['W-1', 'W-3', 'W-2']);
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

  it('shows in each row its number, hazard, place and kind of place, severity, sender and time', async () => {
    serveWarnings({ list: list() });

    renderWarnings();

    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '#',
      'Hazard',
      'Location',
      'Severity',
      'Submitted by',
      'Submitted at',
      'Actions',
    ]);
    const [first, , last] = rows().map(cellsOf);
    expect(first.slice(0, 5)).toEqual(['1', 'Flood', 'GampahaDistrict', 'High', 'Nimali Perera']);
    expect(first[5]).toMatch(/1 hour ago$/);
    expect(first[6]).toBe('Review');
    expect(last.slice(0, 5)).toEqual([
      '3',
      'Landslide',
      'Kelani Ganga basinRiver basin',
      'Critical',
      'Kasun Silva',
    ]);
    expect(last[5]).toMatch(/5 hours ago$/);
  });

  it('marks severity in words as well as colour', async () => {
    serveWarnings({ list: list() });

    renderWarnings();

    await screen.findByRole('table');
    expect(rows().map((row) => cellsOf(row)[3])).toEqual(['High', 'Low', 'Critical']);
  });

  it('gives the table a name a screen reader can announce', async () => {
    serveWarnings({ list: list() });

    renderWarnings();

    expect(
      await screen.findByRole('table', { name: 'Warnings waiting for approval' }),
    ).toBeInTheDocument();
  });

  it('shows four numbers: how many, how urgent, how new, and from how many people', async () => {
    serveWarnings({
      list: [
        ...list(),
        aWarning({
          warningId: 'W-4',
          severity: 'MEDIUM',
          submittedBy: 'usr-duty-3',
          submittedAt: hoursAgo(50),
        }),
      ],
    });

    renderWarnings();

    await screen.findByRole('table');
    expect(stat('Pending Approvals')).toEqual(['4', 'Pending Approvals', 'Oldest: 2 days ago']);
    expect(stat('High Priority')).toEqual(['2', 'High Priority', 'Requires urgent review']);
    expect(stat('Submitted Today')).toEqual(['3', 'Submitted Today', '1 awaiting > 24h']);
    expect(stat('Submitters')).toEqual(['3', 'Submitters', 'Submitted warnings']);
  });

  it('has a Review link on every row that says which warning it opens', async () => {
    serveWarnings({ list: list() });
    const user = userEvent.setup();
    const view = renderWarnings();
    await screen.findByRole('table');

    await user.click(
      screen.getByRole('link', { name: 'Review the Landslide warning for Kelani Ganga basin' }),
    );

    expect(view.router.state.location.pathname).toBe('/warnings/W-2');
  });

  it('says so plainly when nothing is waiting, without cards, tabs or a table', async () => {
    serveWarnings({ list: [] });

    renderWarnings();

    expect(
      await screen.findByText('Nothing is waiting for approval right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Pending Approvals' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Show warnings for' })).not.toBeInTheDocument();
  });

  it('explains a failure in words and offers to try again', async () => {
    let calls = 0;
    server.use(
      http.get('/api/warnings', () => {
        calls += 1;
        return calls === 1 ? apiError(500, 'INTERNAL_ERROR') : json(list());
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
    serveWarnings({ list: list() });

    renderWarnings('/warnings', { language: 'SI' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'අනුමැතිය බලාපොරොත්තු වන ඒවා' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'ගංවතුර (2)' })).toBeInTheDocument();
  });
});

describe('UC-1 step 1: finding a warning (tabs, search, order, period)', () => {
  it('has a tab for every hazard in the list with its count, and filters by it', async () => {
    serveWarnings({ list: list() });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');

    const flood = screen.getByRole('button', { name: 'Flood (2)' });
    expect(screen.getByRole('button', { name: 'All (3)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Drought/ })).not.toBeInTheDocument();

    await user.click(flood);
    expect(flood).toHaveAttribute('aria-pressed', 'true');
    expect(order()).toEqual(['W-1', 'W-3']);

    await user.click(screen.getByRole('button', { name: 'Landslide (1)' }));
    expect(order()).toEqual(['W-2']);

    await user.click(screen.getByRole('button', { name: 'All (3)' }));
    expect(rows()).toHaveLength(3);
  });

  it('keeps the four cards on everything waiting, whichever tab is chosen', async () => {
    serveWarnings({ list: list() });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Landslide (1)' }));

    expect(stat('Pending Approvals')[0]).toBe('3');
  });

  it('finds warnings by hazard, place or sender, whatever the capitals', async () => {
    serveWarnings({ list: list() });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');
    const search = screen.getByRole('searchbox', { name: 'Search warnings' });

    await user.type(search, 'KELANI');
    expect(order()).toEqual(['W-2']);

    await user.clear(search);
    await user.type(search, 'nimali');
    expect(order()).toEqual(['W-1', 'W-3']);

    await user.clear(search);
    await user.type(search, 'landslide');
    expect(order()).toEqual(['W-2']);

    await user.clear(search);
    expect(rows()).toHaveLength(3);
  });

  it('says so, and keeps the pager honest, when nothing matches the search', async () => {
    serveWarnings({ list: list() });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Search warnings' }), 'zzz');

    expect(screen.getByText('No warnings match what you searched for.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 0–0 of 0 warnings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('orders by newest, oldest or severity', async () => {
    serveWarnings({ list: list() });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    expect(sort).toHaveValue('NEWEST');

    await user.selectOptions(sort, 'Oldest');
    expect(order()).toEqual(['W-2', 'W-3', 'W-1']);

    await user.selectOptions(sort, 'Severity');
    expect(order()).toEqual(['W-2', 'W-1', 'W-3']);

    await user.selectOptions(sort, 'Newest');
    expect(order()).toEqual(['W-1', 'W-3', 'W-2']);
  });

  it('puts the newest first among warnings of the same severity', async () => {
    serveWarnings({
      list: [
        aWarning({ warningId: 'W-1', severity: 'HIGH', submittedAt: hoursAgo(4) }),
        aWarning({ warningId: 'W-2', severity: 'HIGH', submittedAt: hoursAgo(1) }),
        aWarning({ warningId: 'W-3', severity: 'HIGH', submittedAt: hoursAgo(2) }),
      ],
    });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'Severity');

    expect(order()).toEqual(['W-2', 'W-3', 'W-1']);
  });

  it('limits the list to today, the last 24 hours or the last 7 days', async () => {
    serveWarnings({
      list: [
        aWarning({ warningId: 'W-1', submittedAt: hoursAgo(1) }),
        aWarning({ warningId: 'W-2', submittedAt: hoursAgo(5) }),
        // 22:00 yesterday: inside the last 24 hours, but not today
        aWarning({ warningId: 'W-3', submittedAt: hoursAgo(14) }),
        aWarning({ warningId: 'W-4', submittedAt: hoursAgo(50) }),
        aWarning({ warningId: 'W-5', submittedAt: hoursAgo(240) }),
      ],
    });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');
    const range = screen.getByRole('combobox', { name: 'Time range' });
    expect(range).toHaveValue('ALL');
    expect(rows()).toHaveLength(5);

    await user.selectOptions(range, 'Last 7 days');
    expect(order()).toEqual(['W-1', 'W-2', 'W-3', 'W-4']);

    await user.selectOptions(range, 'Last 24 hours');
    expect(order()).toEqual(['W-1', 'W-2', 'W-3']);

    await user.selectOptions(range, 'Today');
    expect(order()).toEqual(['W-1', 'W-2']);

    await user.selectOptions(range, 'All time');
    expect(rows()).toHaveLength(5);
  });
});

describe('UC-1 step 1: pages of ten', () => {
  const many = () =>
    Array.from({ length: 12 }, (_, index) =>
      aWarning({ warningId: `W-${index + 1}`, submittedAt: hoursAgo(index + 1) }),
    );
  const numbers = () => rows().map((row) => cellsOf(row)[0]);

  it('shows ten rows and where they are among all of them', async () => {
    serveWarnings({ list: many() });

    renderWarnings();

    await screen.findByRole('table');
    expect(rows()).toHaveLength(10);
    expect(screen.getByText('Showing 1–10 of 12 warnings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 2' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('moves between pages and keeps counting the rows from where the last page ended', async () => {
    serveWarnings({ list: many() });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('Showing 11–12 of 12 warnings')).toBeInTheDocument();
    expect(numbers()).toEqual(['11', '12']);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(numbers()[0]).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(numbers()).toEqual(['11', '12']);
  });

  it('goes back to the first page whenever the search, tab or order changes', async () => {
    serveWarnings({ list: many() });
    const user = userEvent.setup();
    renderWarnings();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(numbers()).toEqual(['11', '12']);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'Oldest');

    expect(screen.getByText('Showing 1–10 of 12 warnings')).toBeInTheDocument();
    expect(order()[0]).toBe('W-12');
  });
});

describe('moving between the three lists from the sidebar', () => {
  /** What the server answers for each list, as the real one does. */
  const serveByStatus = () =>
    server.use(
      http.get('/api/warnings', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        return json(
          status === 'ISSUED'
            ? [aWarning({ warningId: 'W-10', status: 'ISSUED', issuedAt: hoursAgo(1) })]
            : status === 'REJECTED'
              ? [
                  aWarning({
                    warningId: 'W-20',
                    status: 'REJECTED',
                    rejectedAt: hoursAgo(1),
                    rejectionReason: 'Duplicate',
                  }),
                ]
              : list(),
        );
      }),
    );

  it('never draws one list’s rows in another: the pending rows have no issue or rejection time', async () => {
    serveByStatus();
    const view = renderWarnings();
    await screen.findByRole('table', { name: 'Warnings waiting for approval' });

    await act(() => view.router.navigate('/warnings/issued'));

    const issued = await screen.findByRole('table', { name: 'Warnings that have been issued' });
    expect(within(issued).getAllByRole('row')).toHaveLength(2);
    expect(order()).toEqual(['W-10']);

    await act(() => view.router.navigate('/warnings/rejected'));

    const rejected = await screen.findByRole('table', { name: 'Warnings that were rejected' });
    expect(within(rejected).getAllByRole('row')).toHaveLength(2);
    expect(order()).toEqual(['W-20']);

    await act(() => view.router.navigate('/warnings'));

    expect(
      await screen.findByRole('table', { name: 'Warnings waiting for approval' }),
    ).toBeVisible();
    expect(order()).toEqual(['W-1', 'W-3', 'W-2']);
  });

  it('starts each list with an empty search, the first tab and the first page', async () => {
    serveByStatus();
    const user = userEvent.setup();
    const view = renderWarnings();
    await screen.findByRole('table');
    await user.type(screen.getByRole('searchbox', { name: 'Search warnings' }), 'kelani');
    await user.click(screen.getByRole('button', { name: 'Landslide (1)' }));

    await act(() => view.router.navigate('/warnings/issued'));
    await screen.findByRole('table', { name: 'Warnings that have been issued' });

    expect(screen.getByRole('searchbox', { name: 'Search warnings' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'All (1)' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('UC-1 BR6: Pending Approvals offline', () => {
  it('shows the saved copy, and when it was last synced, when the network is down', async () => {
    await cacheWrite('user-1', 'warnings', 'pending-list', list(), { now: Date.now() - 3_600_000 });
    server.use(http.get('/api/warnings', () => HttpResponse.error()));
    setBrowserOnline(false);

    renderWarnings();

    await screen.findByRole('table');
    expect(rows()).toHaveLength(3);
    expect(screen.getByText(/Last synced/)).toHaveTextContent('1 hour ago');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps showing the saved copy next to the error when the server itself fails', async () => {
    await cacheWrite('user-1', 'warnings', 'pending-list', list(), { now: Date.now() - 60_000 });
    server.use(http.get('/api/warnings', () => apiError(500, 'INTERNAL_ERROR')));

    renderWarnings();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(rows()).toHaveLength(3);
  });
});

describe('Issued Warnings (the sister list)', () => {
  const issued = () => [
    aWarning({
      warningId: 'W-10',
      status: 'ISSUED',
      approvedBy: 'usr-dmc-2',
      approvedAt: hoursAgo(3),
      issuedAt: hoursAgo(3),
    }),
    aWarning({
      warningId: 'W-11',
      hazardType: 'CYCLONE',
      severity: 'CRITICAL',
      status: 'ISSUED',
      approvedBy: 'usr-dmc-2',
      approvedAt: hoursAgo(1),
      issuedAt: hoursAgo(1),
    }),
  ];

  it('asks the server only for issued warnings', async () => {
    let status: string | null = null;
    server.use(
      http.get('/api/warnings', ({ request }) => {
        status = new URL(request.url).searchParams.get('status');
        return json([]);
      }),
    );

    renderWarnings('/warnings/issued');

    await screen.findByText('No warnings have been issued yet.');
    expect(status).toBe('ISSUED');
  });

  it('lists what went out, newest first, with when it was issued', async () => {
    serveWarnings({ list: issued() });

    renderWarnings('/warnings/issued');

    expect(screen.getByRole('heading', { level: 1, name: 'Issued Warnings' })).toBeInTheDocument();
    expect(
      screen.getByText('Warnings that were approved and sent, with how they were delivered.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('table', { name: 'Warnings that have been issued' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '#',
      'Hazard',
      'Location',
      'Severity',
      'Issued at',
      'Actions',
    ]);
    expect(order()).toEqual(['W-11', 'W-10']);
    expect(cellsOf(rows()[0])[1]).toBe('Cyclone');
    expect(cellsOf(rows()[0])[4]).toMatch(/1 hour ago$/);
  });

  it('has the four cards only on the pending list', async () => {
    serveWarnings({ list: issued() });

    renderWarnings('/warnings/issued');

    await screen.findByRole('table');
    expect(screen.queryByRole('group', { name: 'Pending Approvals' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'High Priority' })).not.toBeInTheDocument();
  });

  it('opens the delivery summary from each row, and says which warning it is for', async () => {
    serveWarnings({ list: issued() });
    const user = userEvent.setup();
    const view = renderWarnings('/warnings/issued');
    await screen.findByRole('table');

    await user.click(
      screen.getByRole('link', { name: 'Delivery summary of the Cyclone warning for Gampaha' }),
    );

    expect(view.router.state.location.pathname).toBe('/warnings/W-11/delivery');
  });

  it('orders by the time of issue, not the time of submission', async () => {
    serveWarnings({
      list: [
        aWarning({
          warningId: 'W-1',
          status: 'ISSUED',
          submittedAt: hoursAgo(9),
          issuedAt: hoursAgo(1),
        }),
        aWarning({
          warningId: 'W-2',
          status: 'ISSUED',
          submittedAt: hoursAgo(2),
          issuedAt: hoursAgo(4),
        }),
      ],
    });

    renderWarnings('/warnings/issued');

    await screen.findByRole('table');
    expect(order()).toEqual(['W-1', 'W-2']);
  });

  it('says so plainly when nothing has been issued', async () => {
    serveWarnings({ list: [] });

    renderWarnings('/warnings/issued');

    expect(await screen.findByText('No warnings have been issued yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('keeps its own saved copy for the network being down, apart from the pending list', async () => {
    await cacheWrite('user-1', 'warnings', 'issued-list', issued(), { now: Date.now() - 120_000 });
    await cacheWrite('user-1', 'warnings', 'pending-list', list(), { now: Date.now() - 120_000 });
    server.use(http.get('/api/warnings', () => HttpResponse.error()));
    setBrowserOnline(false);

    renderWarnings('/warnings/issued');

    await screen.findByRole('table');
    expect(order()).toEqual(['W-11', 'W-10']);
    expect(screen.getByText(/Last synced/)).toHaveTextContent('2 minutes ago');
  });
});

describe('Rejected Warnings (the other sister list)', () => {
  const rejected = () => [
    aWarning({
      warningId: 'W-20',
      status: 'REJECTED',
      rejectedBy: 'usr-dmc-2',
      rejectedAt: hoursAgo(2),
      rejectionReason: 'Duplicate of W-9',
    }),
    aWarning({
      warningId: 'W-21',
      hazardType: 'DROUGHT',
      severity: 'LOW',
      status: 'REJECTED',
      rejectedBy: 'usr-dmc-2',
      rejectedAt: hoursAgo(6),
      rejectionReason: 'The river has already dropped',
    }),
  ];

  it('asks the server only for rejected warnings', async () => {
    let status: string | null = null;
    server.use(
      http.get('/api/warnings', ({ request }) => {
        status = new URL(request.url).searchParams.get('status');
        return json([]);
      }),
    );

    renderWarnings('/warnings/rejected');

    await screen.findByText('No warnings have been rejected.');
    expect(status).toBe('REJECTED');
  });

  it('lists what was turned down, with when and why', async () => {
    serveWarnings({ list: rejected() });

    renderWarnings('/warnings/rejected');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Rejected Warnings' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Warnings that were turned down, with the reason.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('table', { name: 'Warnings that were rejected' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '#',
      'Hazard',
      'Location',
      'Severity',
      'Rejected at',
      'Reason',
      'Actions',
    ]);
    expect(order()).toEqual(['W-20', 'W-21']);
    expect(cellsOf(rows()[0])[5]).toBe('Duplicate of W-9');
    expect(cellsOf(rows()[1])[1]).toBe('Drought');
  });

  it('finds a warning by the reason it was rejected for', async () => {
    serveWarnings({ list: rejected() });
    const user = userEvent.setup();
    renderWarnings('/warnings/rejected');
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Search warnings' }), 'river');

    expect(order()).toEqual(['W-21']);
  });

  it('opens the warning from each row, where the reason is shown', async () => {
    serveWarnings({ list: rejected() });
    const user = userEvent.setup();
    const view = renderWarnings('/warnings/rejected');
    await screen.findByRole('table');

    await user.click(screen.getByRole('link', { name: 'View the Flood warning for Gampaha' }));

    expect(view.router.state.location.pathname).toBe('/warnings/W-20');
  });

  it('says so plainly when nothing has been rejected', async () => {
    serveWarnings({ list: [] });

    renderWarnings('/warnings/rejected');

    expect(await screen.findByText('No warnings have been rejected.')).toBeInTheDocument();
  });
});

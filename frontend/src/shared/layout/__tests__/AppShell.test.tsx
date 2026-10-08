import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RouteObject } from 'react-router';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { makeMe } from '@/shared/testing/fixtures';
import { renderRoutes } from '@/shared/testing/render';
import { AppShell, initialsOf } from '../AppShell';
import type { NavGroup } from '../navigation';

/** What the badge hook reports: tests set it before the shell is drawn. */
let waiting: number | undefined;
const useWaiting = (): number | undefined => waiting;

const GROUPS: NavGroup[] = [
  {
    id: 'warnings',
    labelKey: 'nav.group.warnings',
    items: [
      {
        id: 'inbox',
        labelKey: 'nav.warnings',
        to: '/warnings',
        icon: 'inbox',
        useBadge: useWaiting,
      },
      { id: 'issued', labelKey: 'nav.warnings.issued', to: '/warnings/issued', icon: 'radio' },
      { id: 'plain', labelKey: 'nav.hazardReports', to: '/hazard-reports' },
      { id: 'donors', labelKey: 'nav.analytics', to: '/analytics', roles: ['DONOR'] },
    ],
  },
];

const ROUTES: RouteObject[] = [
  {
    path: '/',
    element: <AppShell navGroups={GROUPS} />,
    children: [{ path: '*', element: <p>Page body</p> }],
  },
];

async function open(route = '/warnings', me = makeMe()) {
  signIn(me);
  const view = renderRoutes(ROUTES, { route });
  await screen.findByRole('navigation', { name: 'Main navigation' });
  return view;
}

const sidebarLinks = () =>
  within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link');

beforeEach(() => {
  waiting = undefined;
});
afterEach(() => {
  vi.useRealTimers();
  resetBrowserOnline();
});

describe('initialsOf (the letters in the round avatar)', () => {
  it.each([
    ['DMC Officer (demo)', 'DO'],
    ['Nimali Perera', 'NP'],
    ['Nimali', 'N'],
    ['  kasun   de silva ', 'KD'],
    ['(demo)', ''],
    ['', ''],
  ])('turns %j into %j', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe('the sidebar', () => {
  it('names the product and the console, and lists only what the role may open', async () => {
    await open();

    expect(screen.getByText('Safe Zone')).toBeInTheDocument();
    expect(screen.getByText('DMC Officer console')).toBeInTheDocument();
    expect(sidebarLinks().map((link) => link.textContent)).toEqual([
      'Pending Approvals',
      'Issued Warnings',
      'Hazard Reports',
    ]);
  });

  it('puts an icon in front of every entry, a plain dot when the entry brought none', async () => {
    await open();

    const [inbox, issued, plain] = sidebarLinks();
    expect(inbox.querySelector('svg')).not.toBeNull();
    expect(inbox.querySelector('circle')).toBeNull();
    expect(issued.querySelector('svg')).not.toBeNull();
    expect(plain.querySelector('circle')).toHaveAttribute('r', '3');
  });

  it('marks the most specific entry as the page you are on', async () => {
    await open('/warnings/issued');

    const [pending, issued] = sidebarLinks();
    expect(issued).toHaveAttribute('aria-current', 'page');
    expect(pending).not.toHaveAttribute('aria-current');
  });

  it('keeps the parent entry marked while something below it is open', async () => {
    await open('/warnings/W-102');

    const [pending, issued] = sidebarLinks();
    expect(pending).toHaveAttribute('aria-current', 'page');
    expect(issued).not.toHaveAttribute('aria-current');
  });

  it('shows how many are waiting, and tells a screen reader without changing the name of the link', async () => {
    waiting = 3;

    await open();

    const link = screen.getByRole('link', { name: 'Pending Approvals' });
    expect(link).toHaveTextContent('3');
    expect(link).toHaveAccessibleDescription('3 waiting');
  });

  it.each([[0], [undefined]])('draws no badge when the number is %s', async (count) => {
    waiting = count;

    await open();

    const link = screen.getByRole('link', { name: 'Pending Approvals' });
    expect(link).toHaveTextContent(/^Pending Approvals$/);
    expect(link).not.toHaveAccessibleDescription();
  });

  it('shows who is signed in at the bottom, with their initials, role and a way out', async () => {
    await open();

    expect(screen.getByText('DO')).toBeInTheDocument();
    expect(screen.getByText('DMC Officer (demo)')).toBeInTheDocument();
    expect(screen.getAllByText('DMC Officer')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('shows the page it was given inside the frame', async () => {
    await open();

    expect(within(screen.getByRole('main')).getByText('Page body')).toBeInTheDocument();
  });
});

describe('the top bar', () => {
  it('shows today’s date and the time, and moves the time on by itself', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));

    await open();

    const date = screen.getByText(/2026/);
    expect(date).toHaveTextContent(/Thursday/);
    expect(date).toHaveTextContent(/October/);
    expect(screen.getByText(/^12:00/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText(/^12:01/)).toBeInTheDocument();
  });

  it('says whether the connection is up, and follows it when it drops and comes back', async () => {
    await open();
    expect(screen.getByText('Online')).toBeInTheDocument();

    act(() => setBrowserOnline(false));
    expect(await screen.findByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();

    act(() => setBrowserOnline(true));
    expect(await screen.findByText('Online')).toBeInTheDocument();
  });
});

describe('the menu on a phone', () => {
  it('opens from the menu button and shuts again from the same button', async () => {
    const user = userEvent.setup();
    await open();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-controls', 'sidebar');
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('presentation')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
  });

  it('shuts when the dimmed page behind it is pressed', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    await user.click(screen.getByRole('presentation'));

    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shuts on Escape and hands the keyboard back to the menu button', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    await user.keyboard('{Escape}');

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('ignores other keys, and Escape when the menu is already shut', async () => {
    const user = userEvent.setup();
    await open();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open menu' })).not.toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.keyboard('a');
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('shuts after choosing a page', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    await user.click(screen.getByRole('link', { name: 'Issued Warnings' }));

    expect(await screen.findByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

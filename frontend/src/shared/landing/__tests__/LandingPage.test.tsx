import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http } from 'msw';
import { DISTRICTS } from '@contracts/enums';
import { routes } from '@/routes';
import { apiError, makeMe, okUser } from '@/shared/testing/fixtures';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';

const HERO_TITLE = 'Warnings that reach every district, in time.';
const hero = () => screen.findByRole('heading', { level: 1, name: HERO_TITLE });

function anonymous() {
  server.use(
    http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
    http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
  );
}

describe('Landing page: the public front door at /', () => {
  beforeEach(anonymous);

  it('opens with the promise and two clear ways in', async () => {
    renderRoutes(routes, { route: '/' });

    expect(await hero()).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    expect(
      main.getByText(/Report floods, landslides, cyclones and droughts from the field/),
    ).toBeInTheDocument();
    expect(main.getByRole('link', { name: 'Report a hazard' })).toHaveAttribute(
      'href',
      '/hazard-reports',
    );
    expect(main.getByRole('link', { name: 'Register as a citizen' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('has one main heading, and every section is introduced by its own', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'From a field report to a verified warning to coordinated relief',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Built for the Disaster Management Centre and the communities it protects',
      }),
    ).toBeInTheDocument();
  });

  it('sets the browser tab title while open, and restores it when leaving', async () => {
    const view = renderRoutes(routes, { route: '/' });
    await hero();
    expect(document.title).toBe('Safe Zone · Disaster alerts and coordination for Sri Lanka');

    view.unmount();

    expect(document.title).not.toBe('Safe Zone · Disaster alerts and coordination for Sri Lanka');
  });

  it('says who runs the service, and keeps the emergency hotline one tap away on every screen size', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    expect(
      screen.getByText(
        'Official early warning service of the Disaster Management Centre, Sri Lanka',
      ),
    ).toBeInTheDocument();
    const hotlines = screen.getAllByRole('link', { name: /Emergency hotline/ });
    expect(hotlines.length).toBeGreaterThanOrEqual(2);
    for (const link of hotlines) expect(link).toHaveAttribute('href', 'tel:117');
  });

  it('offers a skip link first, and a main region it jumps to', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    const skip = screen.getByRole('link', { name: 'Skip to main content' });

    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getAllByRole('link')[0]).toBe(skip);
  });
});

describe('Landing page: header and footer', () => {
  beforeEach(anonymous);

  it('puts sign in and register in the header, and the section links in the navigation', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(header.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    const nav = within(screen.getByRole('navigation', { name: 'Site navigation' }));
    expect(nav.getByRole('link', { name: 'What we do' })).toHaveAttribute('href', '#what-we-do');
    expect(nav.getByRole('link', { name: 'Report a hazard' })).toHaveAttribute(
      'href',
      '/hazard-reports',
    );
    expect(nav.getByRole('link', { name: 'About' })).toHaveAttribute('href', '#about');
  });

  it('points the section links at sections that exist', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    expect(document.getElementById('what-we-do')).toBeInTheDocument();
    expect(document.getElementById('about')).toBeInTheDocument();
  });

  it('links the logo to the landing page itself', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    const logo = within(screen.getByRole('banner')).getByRole('link', { name: /Safe Zone/ });

    expect(logo).toHaveAttribute('href', '/');
  });

  it('lists the public and the official links in the footer, and the copyright line', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    const footer = within(screen.getByRole('contentinfo'));
    const links = within(footer.getByRole('navigation', { name: 'Footer links' }));
    expect(links.getByRole('link', { name: 'Report a hazard' })).toHaveAttribute(
      'href',
      '/hazard-reports',
    );
    expect(links.getByRole('link', { name: 'Register as a citizen' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(links.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(links.getByRole('link', { name: 'Pending Approvals' })).toHaveAttribute(
      'href',
      '/warnings',
    );
    expect(links.getByRole('link', { name: 'Resource Allocation' })).toHaveAttribute(
      'href',
      '/resources',
    );
    expect(links.getByRole('link', { name: 'Impact Analytics' })).toHaveAttribute(
      'href',
      '/analytics',
    );
    expect(
      footer.getByText(`© ${new Date().getFullYear()} Disaster Management Centre, Sri Lanka`),
    ).toBeInTheDocument();
    expect(footer.getByText('Emergency hotline 117')).toBeInTheDocument();
  });

  it('gives the two header and footer navigations different names, so they can be told apart', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    const names = screen.getAllByRole('navigation').map((nav) => nav.getAttribute('aria-label'));

    expect(names).toEqual(['Site navigation', 'Footer links']);
  });
});

describe('Landing page: what the service does', () => {
  beforeEach(anonymous);

  it('walks through the three stages, each with its own two points', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    const services = within(document.getElementById('what-we-do') as HTMLElement);
    for (const [title, point] of [
      ['Report from the field', 'Works offline, sends when connected'],
      ['Verified local warnings', 'Push notification and SMS'],
      ['Coordinated response', 'Government, armed forces and NGOs'],
    ] as const) {
      const card = within(services.getByRole('heading', { level: 3, name: title }).closest('li')!);
      expect(card.getAllByRole('listitem')).toHaveLength(2);
      expect(card.getByText(point)).toBeInTheDocument();
    }
  });

  it('does not show warnings, a "no warnings" message or any numbers it cannot back up', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    expect(screen.queryByText(/active warning/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No active warnings/i)).not.toBeInTheDocument();
  });
});

describe('Landing page: about', () => {
  beforeEach(anonymous);

  it('counts the districts from the real list, and says who to call', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    const about = within(document.getElementById('about') as HTMLElement);
    expect(about.getByText(String(DISTRICTS.length))).toBeInTheDocument();
    expect(about.getByText('Districts covered by early warnings')).toBeInTheDocument();
    expect(about.getByText('Works without a network')).toBeInTheDocument();
    expect(about.getByText('Sinhala, Tamil and English')).toBeInTheDocument();
    expect(about.getByText('Emergency Operations Centre')).toBeInTheDocument();
    expect(about.getByRole('link', { name: /Emergency hotline, 24\/7/ })).toHaveAttribute(
      'href',
      'tel:117',
    );
  });

  it('describes both photos for people who cannot see them, and loads the lower one lazily', async () => {
    renderRoutes(routes, { route: '/' });
    await hero();

    const top = screen.getByRole('img', { name: /Field reporters, DMC operations centre/ });
    const lower = screen.getByRole('img', { name: /DMC field officer with a tablet/ });

    expect(top).toHaveAttribute('src', '/images/safezone-hero.webp');
    expect(top).toHaveAttribute('fetchpriority', 'high');
    expect(lower).toHaveAttribute('src', '/images/dmc-field-officer.webp');
    expect(lower).toHaveAttribute('loading', 'lazy');
  });
});

describe('Landing page: language', () => {
  beforeEach(anonymous);

  it('switches the whole page from the pills, and tells the browser the page language', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/' });
    await hero();
    const group = within(screen.getByRole('group', { name: 'Language' }));
    expect(group.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(group.getByRole('button', { name: 'සිංහල' }));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'සෑම දිස්ත්‍රික්කයකටම, නියමිත වේලාවට ළඟා වන අනතුරු ඇඟවීම්.',
      }),
    ).toBeInTheDocument();
    expect(group.getByRole('button', { name: 'සිංහල' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(document.documentElement.lang).toBe('si'));
  });

  it('can be read in Tamil', async () => {
    renderRoutes(routes, { route: '/', language: 'TA' });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'ஒவ்வொரு மாவட்டத்தையும் உரிய நேரத்தில் சென்றடையும் எச்சரிக்கைகள்.',
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'உள்நுழைக' }),
    ).toHaveAttribute('href', '/login');
  });
});

describe('Landing page: getting in', () => {
  beforeEach(anonymous);

  it('takes a visitor from "Sign in" to the sign-in page', async () => {
    const user = userEvent.setup();
    const view = renderRoutes(routes, { route: '/' });
    await hero();

    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/login');
  });

  it('takes a visitor from "Register" to the first registration step', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/' });
    await hero();

    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Register' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'About you' })).toBeInTheDocument();
  });

  it('sends a visitor who clicks "Report a hazard" through sign-in first, and remembers where they were going', async () => {
    const user = userEvent.setup();
    const view = renderRoutes(routes, { route: '/' });
    await hero();

    await user.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Report a hazard' }),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(view.router.state.location.state).toMatchObject({
      from: { pathname: '/hazard-reports' },
    });
  });

  it('sends an official who follows a footer link to sign in, then on to that screen', async () => {
    const user = userEvent.setup();
    const view = renderRoutes(routes, { route: '/' });
    await hero();

    await user.click(screen.getByRole('link', { name: 'Impact Analytics' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(view.router.state.location.state).toMatchObject({ from: { pathname: '/analytics' } });
  });
});

describe('Landing page: people who are already signed in, and the wait', () => {
  it('shows a spinner, not the page, while it finds out who is signed in', () => {
    server.use(http.get('/api/auth/me', async () => (await delay(80), okUser(makeMe()))));

    renderRoutes(routes, { route: '/' });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: HERO_TITLE })).not.toBeInTheDocument();
  });

  it('sends someone who is already signed in straight to their own screen', async () => {
    server.use(
      http.get('/api/auth/me', () => okUser(makeMe())),
      http.post('/api/auth/refresh', () => okUser(makeMe())),
    );

    const view = renderRoutes(routes, { route: '/' });

    expect(await screen.findByRole('heading', { name: 'Pending Approvals' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/warnings');
  });
});

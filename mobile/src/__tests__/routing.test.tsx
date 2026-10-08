import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { en } from '@/shared/i18n/messages.en';
import { session } from '@/shared/runtime';
import { aMe } from '@/shared/testing/renderWithApp';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The notification adapter is the boundary to the phone: here it is a stand-in that always allows banners.
jest.mock('@/features/alerts/adapters/ExpoNotifier', () => ({
  WARNINGS_CHANNEL: 'warnings',
  configureNotifications: jest.fn(async () => undefined),
  getNotificationPermission: jest.fn(async () => 'granted'),
  requestNotificationPermission: jest.fn(async () => 'granted'),
  onNotificationTap: jest.fn(() => () => undefined),
  ExpoNotifier: class {
    announce = jest.fn(async () => undefined);
  },
}));

/**
 * The whole app, route files and all, over a pretend server. This is the gate: a person who is not
 * signed in has the sign-in and registration screens and nothing else, and the app moves them when
 * that changes (signing in, signing out, a session the server ended).
 */
interface FakeServer {
  signedIn: boolean;
  sessionDead: boolean;
  alerts: unknown[];
  requests: string[];
}

const server: FakeServer = { signedIn: false, sessionDead: false, alerts: [], requests: [] };

const json = (status: number, body?: unknown) =>
  ({ status, json: async () => body }) as unknown as Response;
const refused = (code: string) => json(401, { error: { code, message: code } });

function answer(method: string, path: string): Response {
  server.requests.push(`${method} ${path}`);
  if (path === '/api/auth/login') {
    server.signedIn = true;
    return json(200, { user: aMe() });
  }
  if (path === '/api/auth/logout') {
    server.signedIn = false;
    return json(204);
  }
  if (path === '/api/auth/refresh') return refused('SESSION_INVALID');
  if (!server.signedIn || server.sessionDead) return refused('UNAUTHENTICATED');
  if (path === '/api/auth/me') return json(200, { user: aMe() });
  if (path === '/api/me/alerts') {
    return json(200, { alerts: server.alerts, serverTime: new Date().toISOString() });
  }
  return json(404, { error: { code: 'ROUTE_NOT_FOUND', message: 'no' } });
}

const alert = {
  alertId: 'A-1',
  warningId: 'W-1',
  hazardType: 'FLOOD',
  severity: 'HIGH',
  message: 'Flood warning: move to higher ground.',
  language: 'EN',
  areas: [{ areaId: 'GAMPAHA', type: 'DISTRICT', name: 'Gampaha', district: 'GAMPAHA' }],
  validFrom: new Date(Date.now() - 3_600_000).toISOString(),
  validTo: new Date(Date.now() + 3_600_000).toISOString(),
  deliveredAt: new Date().toISOString(),
};

beforeEach(async () => {
  // Every real launch starts with the session still unknown; the app shares one session for its whole life,
  // so a test that follows another must put it back to that starting point.
  (session as unknown as { state: unknown }).state = { status: 'loading' };
  Object.assign(server, { signedIn: false, sessionDead: false, alerts: [], requests: [] });
  await AsyncStorage.clear();
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    return answer(init?.method ?? 'GET', url.slice(url.indexOf('/api')));
  });
});

afterEach(() => jest.restoreAllMocks());

/** A phone that was already signed in last time it ran. */
const rememberSignedInPhone = async () => {
  server.signedIn = true;
  await AsyncStorage.setItem(
    'safezone.session',
    JSON.stringify({ userId: 'usr-1', role: 'CITIZEN', displayName: 'Nimali Perera' }),
  );
};

const onSignIn = () => screen.findByRole('header', { name: en['auth.login.title'] });
/** Inside the app: the tab bar, with its Alerts tab, is on screen. */
const inApp = async () => (await screen.findAllByText(en['tabs.alerts']))[0] as never;
const tabBarGone = () => expect(screen.queryByText(en['tabs.alerts'])).toBeNull();

describe('the gate', () => {
  it('shows only the sign-in screen to someone who is not signed in', async () => {
    renderRouter('src/app', { initialUrl: '/' });

    expect(await onSignIn()).toBeTruthy();
    tabBarGone();
  });

  it('keeps a signed-out person out of every screen of the app, however they try to reach it', async () => {
    const { getPathname } = renderRouter('src/app', { initialUrl: '/alerts' });

    expect(await onSignIn()).toBeTruthy();
    tabBarGone();
    expect(getPathname()).not.toContain('/alerts');
  });

  it('opens the app straight away for a phone that is already signed in', async () => {
    await rememberSignedInPhone();

    renderRouter('src/app', { initialUrl: '/' });

    expect(await inApp()).toBeTruthy();
    expect(screen.queryByRole('header', { name: en['auth.login.title'] })).toBeNull();
  });

  it('moves a person into the app when they sign in, and asks the server for their alerts', async () => {
    server.alerts = [alert];
    renderRouter('src/app', { initialUrl: '/' });
    await onSignIn();

    fireEvent.changeText(screen.getByLabelText(en['auth.login.identifier']), '0771234567');
    fireEvent.changeText(screen.getByLabelText(en['auth.login.password']), 'a long password');
    fireEvent.press(screen.getByRole('button', { name: en['auth.login.submit'] }));

    expect(await inApp()).toBeTruthy();
    await waitFor(() => expect(server.requests).toContain('GET /api/me/alerts'));
  });

  it('shows the person’s warnings in the Alerts tab, and an unread count on the tab', async () => {
    await rememberSignedInPhone();
    server.alerts = [alert];
    renderRouter('src/app', { initialUrl: '/' });

    fireEvent.press(await inApp());

    expect(await screen.findByText('Flood warning: move to higher ground.')).toBeTruthy();
    expect(screen.getByLabelText(`${en['tabs.alerts']}, 1 unread`)).toBeTruthy();
  });

  it('sends the person back to sign-in when they sign out', async () => {
    await rememberSignedInPhone();
    renderRouter('src/app', { initialUrl: '/alerts' });
    await inApp();

    fireEvent.press(await screen.findByRole('button', { name: en['auth.account.signOut'] }));
    const asking = within(screen.getByLabelText(en['auth.account.signOutTitle']));
    fireEvent.press(asking.getByRole('button', { name: en['auth.account.signOut'] }));

    expect(await onSignIn()).toBeTruthy();
    expect(server.requests).toContain('POST /api/auth/logout');
    tabBarGone();
  });

  it('sends the person back to sign-in, saying why, when the server ends their session', async () => {
    await rememberSignedInPhone();
    renderRouter('src/app', { initialUrl: '/alerts' });
    const list = await screen.findByTestId('alerts-list');

    server.sessionDead = true;
    await act(async () => list.props.refreshControl.props.onRefresh());

    expect(await onSignIn()).toBeTruthy();
    expect(screen.getByText(en['auth.login.sessionExpired'])).toBeTruthy();
    tabBarGone();
  });

  it('opens registration from the sign-in screen', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await onSignIn();

    fireEvent.press(screen.getByRole('button', { name: en['auth.login.registerLink'] }));

    expect(
      await screen.findByRole('header', { name: en['auth.register.step1.title'] }),
    ).toBeTruthy();
  });
});

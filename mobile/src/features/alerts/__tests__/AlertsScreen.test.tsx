import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { en } from '@/shared/i18n/messages.en';
import { si } from '@/shared/i18n/messages.si';
import { InboxUnavailable } from '../domain/types';
import type { PermissionGateway } from '../hooks/useNotificationPermission';
import { AlertsScreen } from '../screens/AlertsScreen';
import { anAlert, at, HOUR, snapshotOf } from '../testing/fakes';
import { renderInbox, type InboxOptions } from '../testing/renderInbox';

const granted: PermissionGateway = { get: async () => 'granted', request: async () => 'granted' };

async function open(options: InboxOptions = {}, permissions: PermissionGateway = granted) {
  const onOpen = jest.fn();
  const view = await renderInbox(
    <AlertsScreen permissions={permissions} onOpen={onOpen} />,
    options,
  );
  return { ...view, onOpen };
}

const rows = () => screen.queryAllByTestId(/^alert-row-/);

describe('AlertsScreen: the list', () => {
  const three = [
    anAlert({
      alertId: 'A-old',
      hazardType: 'LANDSLIDE',
      severity: 'LOW',
      deliveredAt: at(-2 * HOUR),
    }),
    anAlert({ alertId: 'A-new', hazardType: 'FLOOD', severity: 'CRITICAL', deliveredAt: at(0) }),
    anAlert({
      alertId: 'A-mid',
      hazardType: 'CYCLONE',
      severity: 'MEDIUM',
      deliveredAt: at(-HOUR),
    }),
  ];

  it('lists every warning sent to the citizen, newest first', async () => {
    await open({ alerts: three });

    expect(rows().map((row) => row.props.testID)).toEqual([
      'alert-row-A-new',
      'alert-row-A-mid',
      'alert-row-A-old',
    ]);
  });

  it('shows each warning’s severity as a chip with words, its hazard, where and when', async () => {
    await open({ alerts: [three[1] as never] });

    const row = within(screen.getByTestId('alert-row-A-new'));
    expect(row.getByText(en['hazard.FLOOD'])).toBeTruthy();
    expect(row.getByText(en['severity.CRITICAL'])).toBeTruthy();
    expect(row.getByText('Gampaha · Today, 14:30')).toBeTruthy();
    expect(row.getByText(en['alerts.status.active'])).toBeTruthy();
  });

  it('puts an unread dot on every warning that has not been opened, and counts them', async () => {
    await open({ alerts: three });

    expect(screen.getAllByTestId('unread-dot')).toHaveLength(3);
    expect(await screen.findByText(/3 unread/)).toBeTruthy();
  });

  it('removes the dot and the count once a warning has been read', async () => {
    const { poller } = await open({ alerts: three });

    await act(() => poller.markRead('A-mid'));

    expect(screen.getAllByTestId('unread-dot')).toHaveLength(2);
    expect(screen.getByText(/2 unread/)).toBeTruthy();
    expect(within(screen.getByTestId('alert-row-A-mid')).queryByTestId('unread-dot')).toBeNull();
  });

  it('says in words that a row is unread, for a screen reader', async () => {
    await open({ alerts: [three[1] as never] });

    expect(
      screen.getByRole('button', {
        name: /^Unread\. Critical Flood warning, Today, 14:30, Active/,
      }),
    ).toBeTruthy();
  });

  it('marks a warning that has ended as expired, and one that has not begun as upcoming', async () => {
    await open({
      alerts: [
        anAlert({ alertId: 'A-gone', validFrom: at(-3 * HOUR), validTo: at(-HOUR) }),
        anAlert({ alertId: 'A-soon', validFrom: at(2 * HOUR), validTo: at(5 * HOUR) }),
      ],
    });

    expect(
      within(screen.getByTestId('alert-row-A-gone')).getByText(en['alerts.status.expired']),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('alert-row-A-soon')).getByText('Starts Today, 16:30'),
    ).toBeTruthy();
  });

  it('opens a warning when its row is tapped', async () => {
    const { onOpen } = await open({ alerts: three });

    fireEvent.press(screen.getByTestId('alert-row-A-mid'));

    expect(onOpen).toHaveBeenCalledWith('A-mid');
  });

  it('names the districts in the app’s language', async () => {
    await open({ alerts: [anAlert()] });
    expect(screen.getByText(/^Gampaha · /)).toBeTruthy();

    fireEvent.press(screen.getByRole('radio', { name: en['lang.SI'] }));

    expect(await screen.findByText(/^ගම්පහ \(Gampaha\) · /)).toBeTruthy();
    expect(screen.getByText(si['alerts.status.active'])).toBeTruthy();
  });

  it('names a river basin as the DMC wrote it', async () => {
    await open({
      alerts: [
        anAlert({
          areas: [
            {
              areaId: 'kelani',
              type: 'RIVER_BASIN',
              name: 'Kelani Ganga basin',
              district: 'COLOMBO',
            },
          ],
        }),
      ],
    });

    expect(screen.getByText(/^Kelani Ganga basin · /)).toBeTruthy();
  });
});

describe('AlertsScreen: when there is nothing to show yet', () => {
  it('says the inbox is empty once the first fetch has answered', async () => {
    await open({ alerts: [] });

    expect(screen.getByText(en['alerts.empty.title'])).toBeTruthy();
    expect(screen.getByText(en['alerts.empty.body'])).toBeTruthy();
  });

  it('says it is loading while the first fetch is under way, not that the inbox is empty', async () => {
    const { gateway } = await open({ alerts: [], holdFirstFetch: true });

    expect(await screen.findByText(en['alerts.loading'])).toBeTruthy();
    expect(screen.queryByText(en['alerts.empty.title'])).toBeNull();
    await act(async () => gateway.letThrough());
    expect(await screen.findByText(en['alerts.empty.title'])).toBeTruthy();
  });

  it('says it is offline, with nothing to show, when the very first fetch fails', async () => {
    await open({ answers: [new InboxUnavailable('OFFLINE')] });

    expect(screen.getByText(en['alerts.offline'])).toBeTruthy();
    expect(screen.getByText(en['alerts.empty.title'])).toBeTruthy();
  });
});

describe('AlertsScreen: offline and errors', () => {
  it('keeps the list and says it is offline when a later fetch cannot reach the server', async () => {
    const { poller } = await open({
      answers: [snapshotOf([anAlert()]), new InboxUnavailable('OFFLINE')],
    });

    await act(() => poller.pollNow());

    expect(screen.getByText(en['alerts.offline'])).toBeTruthy();
    expect(rows()).toHaveLength(1);
  });

  it('asks the person to pull down again after a server problem', async () => {
    const { poller } = await open({
      answers: [snapshotOf([anAlert()]), new InboxUnavailable('SERVER')],
    });

    await act(() => poller.pollNow());

    expect(screen.getByText(en['alerts.error'])).toBeTruthy();
    expect(rows()).toHaveLength(1);
  });

  it('takes the notice away when the next fetch works', async () => {
    const { poller } = await open({
      answers: [new InboxUnavailable('OFFLINE'), snapshotOf([anAlert()])],
    });
    expect(screen.getByText(en['alerts.offline'])).toBeTruthy();

    await act(() => poller.pollNow());

    expect(screen.queryByText(en['alerts.offline'])).toBeNull();
  });

  it('sends the person back to sign in when the session has ended', async () => {
    const { controller } = await open({ answers: [new InboxUnavailable('SESSION_EXPIRED')] });

    expect(controller.getState()).toEqual({ status: 'signedOut', reason: 'expired' });
  });

  it('shows when the list was last fetched', async () => {
    await open({ alerts: [anAlert()] });

    expect(screen.getByText(/Updated Today, 14:30/)).toBeTruthy();
  });
});

describe('AlertsScreen: refreshing', () => {
  it('fetches again when the list is pulled down', async () => {
    const { gateway } = await open({ alerts: [anAlert()] });
    expect(gateway.calls).toBe(1);

    const { refreshControl } = screen.getByTestId('alerts-list').props;
    await act(async () => refreshControl.props.onRefresh());

    expect(gateway.calls).toBe(2);
  });

  it('shows a spinner while it fetches, and stops when done', async () => {
    const { gateway } = await open({ alerts: [anAlert()] });
    gateway.hold();

    const { refreshControl } = screen.getByTestId('alerts-list').props;
    act(() => void refreshControl.props.onRefresh());
    expect(screen.getByTestId('alerts-list').props.refreshControl.props.refreshing).toBe(true);
    await act(async () => gateway.letThrough());

    expect(screen.getByTestId('alerts-list').props.refreshControl.props.refreshing).toBe(false);
  });

  it('fetches by itself every 15 seconds, and shows a warning the moment it arrives', async () => {
    const { scheduler, gateway, notifier } = await open({
      answers: [snapshotOf([]), snapshotOf([anAlert({ alertId: 'A-late' })])],
    });
    expect(rows()).toHaveLength(0);

    await act(async () => scheduler.tick());

    expect(gateway.calls).toBe(2);
    expect(rows()).toHaveLength(1);
    expect(notifier.ids).toEqual(['A-late']);
    expect(scheduler.intervals).toEqual([15_000]);
  });

  it('does not announce a warning that is already in the list', async () => {
    const { scheduler, notifier } = await open({ alerts: [anAlert()] });

    await act(async () => scheduler.tick());
    await act(async () => scheduler.tick());

    expect(notifier.ids).toEqual(['A-1']);
  });
});

describe('AlertsScreen: the account area', () => {
  it('says who is signed in and which language the app is in', async () => {
    await open({ alerts: [] });

    expect(screen.getByText('Signed in as Nimali Perera')).toBeTruthy();
    expect(screen.getByRole('radio', { name: en['lang.EN'], selected: true })).toBeTruthy();
  });

  // The question is drawn by the app, not by `Alert.alert`: that does nothing in a browser, where the
  // Sign out button used to look dead.
  const question = () => screen.queryByLabelText(en['auth.account.signOutTitle']);

  it('asks before signing out, and signs out when confirmed', async () => {
    const { controller } = await open({ alerts: [] });
    expect(question()).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: en['auth.account.signOut'] }));

    const asking = within(screen.getByLabelText(en['auth.account.signOutTitle']));
    expect(asking.getByText(en['auth.account.signOutBody'])).toBeTruthy();
    expect(controller.getState().status).toBe('signedIn');
    await act(async () =>
      fireEvent.press(asking.getByRole('button', { name: en['auth.account.signOut'] })),
    );
    expect(controller.getState()).toEqual({ status: 'signedOut' });
  });

  it('stays signed in when the person cancels, and can ask again', async () => {
    const { controller } = await open({ alerts: [] });
    const signOut = () => screen.getByRole('button', { name: en['auth.account.signOut'] });

    fireEvent.press(signOut());
    const asking = within(screen.getByLabelText(en['auth.account.signOutTitle']));
    fireEvent.press(asking.getByRole('button', { name: en['common.cancel'] }));

    expect(question()).toBeNull();
    expect(controller.getState().status).toBe('signedIn');
    fireEvent.press(signOut());
    expect(question()).not.toBeNull();
  });

  it('shows nothing here once nobody is signed in', async () => {
    const { controller } = await open({ alerts: [] });

    await act(() => controller.signOut());

    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });
});

describe('AlertsScreen: asking for permission to show banners', () => {
  const gateway = (
    status: 'granted' | 'undetermined' | 'denied' | 'unsupported',
  ): PermissionGateway & { asked: number } => {
    const fake = {
      asked: 0,
      get: async () => status,
      request: async () => {
        fake.asked += 1;
        return 'granted' as const;
      },
    };
    return fake;
  };

  it('says nothing when banners are already allowed', async () => {
    await open({ alerts: [] }, gateway('granted'));

    expect(screen.queryByText(en['alerts.notify.enable'])).toBeNull();
    expect(screen.queryByText(en['alerts.notify.blocked'])).toBeNull();
  });

  it('says nothing where notifications cannot exist at all, such as the browser build', async () => {
    await open({ alerts: [] }, gateway('unsupported'));

    expect(screen.queryByText(en['alerts.notify.enable'])).toBeNull();
    expect(screen.queryByText(en['alerts.notify.blocked'])).toBeNull();
  });

  it('asks, in one line, and then disappears once the person agrees', async () => {
    const permissions = gateway('undetermined');
    await open({ alerts: [] }, permissions);

    fireEvent.press(await screen.findByRole('button', { name: en['alerts.notify.enable'] }));

    await act(async () => undefined);
    expect(permissions.asked).toBe(1);
    expect(screen.queryByText(en['alerts.notify.enable'])).toBeNull();
  });

  it('points to the phone’s settings when notifications have been refused for good', async () => {
    await open({ alerts: [] }, gateway('denied'));

    expect(await screen.findByText(en['alerts.notify.blocked'])).toBeTruthy();
    expect(screen.getByRole('button', { name: en['alerts.notify.openSettings'] })).toBeTruthy();
  });

  it('looks again when the app returns to the front, after a visit to the settings', async () => {
    let status: 'denied' | 'granted' = 'denied';
    const permissions: PermissionGateway = { get: async () => status, request: async () => status };
    await open({ alerts: [] }, permissions);
    expect(await screen.findByText(en['alerts.notify.blocked'])).toBeTruthy();

    status = 'granted';
    const listeners = (AppState.addEventListener as jest.Mock).mock.calls
      .filter(([event]) => event === 'change')
      .map(([, listener]) => listener as (state: string) => void);
    await act(async () => listeners.forEach((listener) => listener('active')));

    expect(screen.queryByText(en['alerts.notify.blocked'])).toBeNull();
  });
});

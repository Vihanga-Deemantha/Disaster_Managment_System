import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  configureNotifications,
  ExpoNotifier,
  getNotificationPermission,
  onNotificationTap,
  requestNotificationPermission,
  WARNINGS_CHANNEL,
} from '../adapters/ExpoNotifier';
import { anAlert } from '../testing/fakes';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'scheduled'),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  AndroidImportance: { MAX: 7 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: 'max' },
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const status = (granted: boolean, canAskAgain = true) =>
  ({ granted, canAskAgain, status: granted ? 'granted' : 'denied', expires: 'never' }) as never;

const onPlatform = (os: 'android' | 'ios' | 'web') => jest.replaceProperty(Platform, 'OS', os);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getLastNotificationResponseAsync.mockResolvedValue(null);
});

describe('configureNotifications', () => {
  it('shows a banner, in the list and with sound, even while the app is open', async () => {
    onPlatform('ios');

    await configureNotifications('Disaster warnings');

    const { handleNotification } = mocked.setNotificationHandler.mock.calls[0]?.[0] as {
      handleNotification: () => Promise<unknown>;
    };
    expect(await handleNotification()).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('gives warnings their own loud channel on Android, named for the person', async () => {
    onPlatform('android');

    await configureNotifications('ආපදා අනතුරු ඇඟවීම්');

    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(WARNINGS_CHANNEL, {
      name: 'ආපදා අනතුරු ඇඟවීම්',
      importance: 7,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#b91c1c',
      lockscreenVisibility: 1,
      sound: 'default',
    });
  });

  it('does nothing on the web, where local notifications do not exist', async () => {
    onPlatform('web');

    await configureNotifications('Disaster warnings');

    expect(mocked.setNotificationHandler).not.toHaveBeenCalled();
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe('permission', () => {
  beforeEach(() => onPlatform('ios'));

  it.each([
    ['allowed', status(true), 'granted'],
    ['not asked yet, or refused once and askable again', status(false, true), 'undetermined'],
    ['refused for good', status(false, false), 'denied'],
  ] as const)('reads %s', async (_label, answer, expected) => {
    mocked.getPermissionsAsync.mockResolvedValue(answer);

    expect(await getNotificationPermission()).toBe(expected);
  });

  it('asks the system, and reports its answer', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(status(true));

    expect(await requestNotificationPermission()).toBe('granted');
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('is unsupported on the web, where there is nothing to ask for', async () => {
    onPlatform('web');

    expect(await getNotificationPermission()).toBe('unsupported');
    expect(await requestNotificationPermission()).toBe('unsupported');
    expect(mocked.getPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('ExpoNotifier.announce', () => {
  it('puts an immediate banner on the Android warnings channel, named for the alert', async () => {
    onPlatform('android');
    mocked.getPermissionsAsync.mockResolvedValue(status(true));

    await new ExpoNotifier().announce(
      anAlert({ alertId: 'A-9', hazardType: 'LANDSLIDE', severity: 'CRITICAL' }),
    );

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'A-9',
      content: {
        title: 'Landslide warning · Critical',
        body: anAlert().message,
        data: { alertId: 'A-9' },
        sound: 'default',
        priority: 'max',
      },
      trigger: { channelId: WARNINGS_CHANNEL },
    });
  });

  it('uses no trigger at all on iOS: a null trigger shows the banner now', async () => {
    onPlatform('ios');
    mocked.getPermissionsAsync.mockResolvedValue(status(true));

    await new ExpoNotifier().announce(anAlert());

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: null }),
    );
  });

  it('writes the banner in the alert’s own language', async () => {
    onPlatform('ios');
    mocked.getPermissionsAsync.mockResolvedValue(status(true));

    await new ExpoNotifier().announce(anAlert({ language: 'SI' }));

    const request = mocked.scheduleNotificationAsync.mock.calls[0]?.[0] as {
      content: { title: string };
    };
    expect(request.content.title).toBe('ගංවතුර අනතුරු ඇඟවීම · ඉහළ');
  });

  it('refuses, without asking the person, when notifications are not allowed', async () => {
    onPlatform('ios');
    mocked.getPermissionsAsync.mockResolvedValue(status(false, false));

    await expect(new ExpoNotifier().announce(anAlert())).rejects.toThrow(
      'Notifications are not allowed on this phone.',
    );

    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('refuses on the web', async () => {
    onPlatform('web');

    await expect(new ExpoNotifier().announce(anAlert())).rejects.toThrow();
  });
});

describe('onNotificationTap', () => {
  const response = (data: Record<string, unknown> | undefined) =>
    ({ notification: { request: { content: { data } } } }) as never;
  const remove = jest.fn();

  beforeEach(() => {
    onPlatform('ios');
    mocked.addNotificationResponseReceivedListener.mockReturnValue({ remove } as never);
  });

  it('opens the alert a tapped banner is about', () => {
    const open = jest.fn();
    onNotificationTap(open);
    const listener = mocked.addNotificationResponseReceivedListener.mock.calls[0]?.[0] as (
      r: never,
    ) => void;

    listener(response({ alertId: 'A-3' }));

    expect(open).toHaveBeenCalledWith('A-3');
  });

  it('ignores a notification that is not about an alert', () => {
    const open = jest.fn();
    onNotificationTap(open);
    const listener = mocked.addNotificationResponseReceivedListener.mock.calls[0]?.[0] as (
      r: never,
    ) => void;

    listener(response(undefined));
    listener(response({ alertId: 42 }));
    listener(response({ other: 'x' }));

    expect(open).not.toHaveBeenCalled();
  });

  it('opens the alert whose banner started the app from closed, once', async () => {
    mocked.getLastNotificationResponseAsync.mockResolvedValue(response({ alertId: 'A-4' }));
    const open = jest.fn();

    onNotificationTap(open);
    await Promise.resolve();
    await Promise.resolve();

    expect(open).toHaveBeenCalledWith('A-4');
    expect(mocked.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing about a start that no banner caused', async () => {
    const open = jest.fn();

    onNotificationTap(open);
    await Promise.resolve();
    await Promise.resolve();

    expect(open).not.toHaveBeenCalled();
    expect(mocked.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
  });

  it('stops listening when told to', () => {
    const stop = onNotificationTap(jest.fn());

    stop();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('listens to nothing on the web', () => {
    onPlatform('web');

    const stop = onNotificationTap(jest.fn());
    stop();

    expect(mocked.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  });
});

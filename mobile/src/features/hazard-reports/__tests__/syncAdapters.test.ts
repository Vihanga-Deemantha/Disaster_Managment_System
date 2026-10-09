import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ApiSessionGate } from '../adapters/ApiSessionGate';
import { NetInfoConnectivityMonitor } from '../adapters/NetInfoConnectivityMonitor';
import { ExpoSyncNotifier, askNotificationPermission } from '../adapters/ExpoSyncNotifier';

jest.mock('@react-native-community/netinfo', () => ({
  configure: jest.fn(),
  fetch: jest.fn(),
  addEventListener: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
beforeEach(() => {
  jest.resetAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());
describe('UC-3 sync native boundaries', () => {
  it.each([
    [{ granted: true, canAskAgain: true }, 'GRANTED'],
    [{ granted: false, canAskAgain: false }, 'DENIED'],
  ] as const)(
    'returns existing permission without asking again (%s)',
    async (permission, result) => {
      jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission as never);
      expect(await askNotificationPermission()).toBe(result);
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    },
  );
  it('reports native permission failures and a refused new request explicitly', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockRejectedValueOnce(new Error('native'));
    expect(await askNotificationPermission()).toBe('UNAVAILABLE');
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue({ granted: false, canAskAgain: true } as never);
    jest
      .mocked(Notifications.requestPermissionsAsync)
      .mockResolvedValue({ granted: false } as never);
    expect(await askNotificationPermission()).toBe('DENIED');
  });
  it.each([
    [200, { user: { userId: 'citizen-1', role: 'CITIZEN' } }, 'citizen-1'],
    [200, { user: { userId: 'volunteer-1', role: 'COMMUNITY_VOLUNTEER' } }, 'volunteer-1'],
    [401, {}, undefined],
    [200, { user: { userId: 'officer', role: 'DMC_OFFICER' } }, undefined],
  ] as const)('checks the authenticated session for status %s', async (status, body, expected) => {
    const api = { send: jest.fn(async () => ({ status, body })), request: jest.fn() };
    expect(await new ApiSessionGate(api).currentUserId()).toBe(expected);
  });
  it.each([
    [500, {}],
    [200, {}],
    [200, { user: { userId: '', role: 'CITIZEN' } }],
  ])(
    'treats malformed or unavailable session responses as failed connectivity (%s)',
    async (status, body) => {
      const api = { send: async () => ({ status: status as number, body }), request: jest.fn() };
      await expect(new ApiSessionGate(api).currentUserId()).rejects.toThrow();
    },
  );
  it('uses the API health GET probe even when the LAN has no public internet and unsubscribes', async () => {
    const monitor = new NetInfoConnectivityMonitor();
    expect(NetInfo.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        reachabilityMethod: 'GET',
        useNativeReachability: false,
        reachabilityUrl: expect.stringContaining('/api/health'),
      }),
    );
    const config = jest.mocked(NetInfo.configure).mock.calls[0][0]!;
    expect(await config.reachabilityTest!({ status: 200 } as Response)).toBe(true);
    expect(await config.reachabilityTest!({ status: 500 } as Response)).toBe(false);
    jest
      .mocked(NetInfo.fetch)
      .mockResolvedValue({ isConnected: true, isInternetReachable: true } as never);
    expect(await monitor.isOnline()).toBe(true);
    let listener!: (state: unknown) => void;
    const stop = jest.fn();
    jest.mocked(NetInfo.addEventListener).mockImplementation((callback) => {
      listener = callback as typeof listener;
      return stop;
    });
    const reconnect = jest.fn();
    const unsubscribe = monitor.onReconnect(reconnect);
    listener({ isConnected: false, isInternetReachable: false });
    listener({ isConnected: true, isInternetReachable: true });
    listener({ isConnected: true, isInternetReachable: true });
    expect(reconnect).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('sends sync confirmations only with existing notification permission, without prompting in the background', async () => {
    const kv = { get: async () => 'EN', set: async () => undefined, remove: async () => undefined };
    const notifier = new ExpoSyncNotifier(kv);
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as never);
    await notifier.reportsSent(2);
    await notifier.signInNeeded(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: { channelId: 'report-sync' } }),
    );
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as never);
    await notifier.reportsSent(3);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    jest
      .mocked(Notifications.requestPermissionsAsync)
      .mockResolvedValue({ granted: true } as never);
    await askNotificationPermission();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    jest.mocked(Notifications.getPermissionsAsync).mockRejectedValue(new Error('unavailable'));
    await expect(notifier.reportsSent(1)).resolves.toBeUndefined();
  });
});

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { notificationContent } from '../domain/notificationText';
import type { AlertNotifier } from '../domain/ports';
import type { Alert } from '../domain/types';

/**
 * The one place the app uses expo-notifications. The prototype shows warnings as LOCAL notifications:
 * when the inbox poll finds a new alert it asks the phone to show a banner at once. Remote push is not
 * used, because it does not work in Expo Go.
 */
export const WARNINGS_CHANNEL = 'warnings';

/** `unsupported`: nothing to ask for (the browser build cannot show phone notifications). */
export type NotificationPermission = 'granted' | 'undetermined' | 'denied' | 'unsupported';

const toPermission = (
  status: Notifications.NotificationPermissionsStatus,
): NotificationPermission => {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
};

/**
 * Call once at start-up. Without a handler the phone drops a notification that arrives while the app
 * is open, which is exactly when the poll finds new alerts; so banners are switched on here. On Android
 * warnings also get a channel of their own (loud, shown on the lock screen), which must exist before
 * the permission prompt can appear.
 */
export async function configureNotifications(channelName: string): Promise<void> {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(WARNINGS_CHANNEL, {
    name: channelName,
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#b91c1c',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (Platform.OS === 'web') return 'unsupported';
  return toPermission(await Notifications.getPermissionsAsync());
}

/** Shows the system prompt (once, when the person taps "Turn on notifications"). */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (Platform.OS === 'web') return 'unsupported';
  return toPermission(await Notifications.requestPermissionsAsync());
}

/** Shows a banner for an alert. It refuses, without asking, when the person has not allowed notifications. */
export class ExpoNotifier implements AlertNotifier {
  async announce(alert: Alert): Promise<void> {
    if ((await getNotificationPermission()) !== 'granted') {
      throw new Error('Notifications are not allowed on this phone.');
    }
    const { title, body, data } = notificationContent(alert);
    await Notifications.scheduleNotificationAsync({
      // The alert's own id: announcing the same alert twice replaces the banner instead of stacking two.
      identifier: alert.alertId,
      content: {
        title,
        body,
        data,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      // An immediate banner. On Android it must name the channel, or it lands in a quiet default one.
      trigger: Platform.OS === 'android' ? { channelId: WARNINGS_CHANNEL } : null,
    });
  }
}

/**
 * Calls `open` with an alert's id when the person taps its banner, including the tap that started the
 * app from closed. Returns the function that stops listening.
 */
export function onNotificationTap(open: (alertId: string) => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const handle = (response: Notifications.NotificationResponse | null): void => {
    const alertId = response?.notification.request.content.data?.alertId;
    if (typeof alertId === 'string') open(alertId);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  void Notifications.getLastNotificationResponseAsync().then((last) => {
    handle(last);
    return last ? Notifications.clearLastNotificationResponseAsync() : undefined;
  });
  return () => subscription.remove();
}

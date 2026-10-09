import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Language } from '@/shared/contracts/enums';
import { translatorFor } from '@/shared/i18n/translate';
import type { KeyValueStore } from '@/shared/storage/KeyValueStore';
import type { SyncNotifier } from '../offline/ports';

const CHANNEL = 'report-sync';
async function ensureChannel(): Promise<void> {
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Report delivery',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
}
/** Called only from the foreground permission button, after its explanation is visible. */
export async function askNotificationPermission(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ensureChannel();
    await Notifications.requestPermissionsAsync();
  } catch {
    /* A denied/unavailable permission cannot undo saving a report. */
  }
}
export class ExpoSyncNotifier implements SyncNotifier {
  constructor(private readonly store: KeyValueStore) {}
  reportsSent(count: number): Promise<void> {
    return this.announce('reports.syncSent', count);
  }
  signInNeeded(count: number): Promise<void> {
    return this.announce('reports.syncSignIn', count);
  }
  private async announce(
    key: 'reports.syncSent' | 'reports.syncSignIn',
    count: number,
  ): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      if (!(await Notifications.getPermissionsAsync()).granted) return;
      await ensureChannel();
      const saved = await this.store.get('safezone.ui-language');
      const language: Language = saved === 'SI' || saved === 'TA' ? saved : 'EN';
      const t = translatorFor(language);
      await Notifications.scheduleNotificationAsync({
        identifier: `report-sync-${key}`,
        content: {
          title: t('reports.syncTitle'),
          body: t(key, { count }),
          data: { kind: 'REPORT_SYNC' },
        },
        trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
      });
    } catch {
      /* Notifications are optional; delivery is already committed. */
    }
  }
}

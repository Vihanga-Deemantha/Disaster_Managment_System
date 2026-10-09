import { useEffect } from 'react';
import { AppState } from 'react-native';
import { ensureSyncTaskRegistered } from '../background/syncTask';
import { syncTaskStatus } from '../background/taskStatus';
import { getHazardReportsRuntime } from '../composition';
import type { SyncTrigger } from '../offline/types';

export function useSyncTriggers(ownerId?: string): void {
  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    const { sync, connectivity } = getHazardReportsRuntime();
    const run = (trigger: SyncTrigger) => {
      void sync.run(trigger).catch(() => undefined);
    };
    void ensureSyncTaskRegistered()
      .then((status) => {
        if (active) syncTaskStatus.set(status);
      })
      .catch(() => {
        if (active) syncTaskStatus.set('UNAVAILABLE');
      });
    run('APP_FOREGROUND');
    const stop = connectivity.onReconnect(() => run('RECONNECT'));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run('APP_FOREGROUND');
    });
    return () => {
      active = false;
      stop();
      subscription.remove();
    };
  }, [ownerId]);
}

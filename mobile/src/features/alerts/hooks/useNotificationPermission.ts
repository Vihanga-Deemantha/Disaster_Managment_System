import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { NotificationPermission } from '../adapters/ExpoNotifier';

export interface PermissionGateway {
  get: () => Promise<NotificationPermission>;
  request: () => Promise<NotificationPermission>;
}

/**
 * Whether the phone lets the app show notifications, and a way to ask. It looks again when the app
 * returns to the front, because the person may have just changed it in the phone's settings.
 */
export function useNotificationPermission(permissions: PermissionGateway) {
  const [status, setStatus] = useState<NotificationPermission | 'checking'>('checking');

  const check = useCallback(() => {
    permissions
      .get()
      .then(setStatus)
      .catch(() => setStatus('denied'));
  }, [permissions]);

  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => subscription.remove();
  }, [check]);

  const request = useCallback(async () => {
    try {
      setStatus(await permissions.request());
    } catch {
      setStatus('denied');
    }
  }, [permissions]);

  return { status, request };
}

import { api, storage } from '@/shared/runtime';
import {
  ExpoNotifier,
  getNotificationPermission,
  requestNotificationPermission,
} from './adapters/ExpoNotifier';
import { intervalScheduler, systemClock } from './adapters/timing';
import { HttpAlertsGateway } from './api/HttpAlertsGateway';
import { AlertInboxPoller } from './domain/AlertInboxPoller';
import type { PermissionGateway } from './hooks/useNotificationPermission';
import { KeyValueInboxStorage } from './storage/KeyValueInboxStorage';

/**
 * Builds one citizen's inbox poller from the real parts: the app's API client (and its cookie jar),
 * local notifications, the phone's storage, its clock and a real timer. Everything else in the feature
 * is handed a poller and never builds one, so tests give it fakes.
 */
export const createInboxPoller = (userId: string): AlertInboxPoller =>
  new AlertInboxPoller({
    gateway: new HttpAlertsGateway(api),
    notifier: new ExpoNotifier(),
    storage: new KeyValueInboxStorage(storage, userId),
    clock: systemClock,
    scheduler: intervalScheduler,
  });

/** The phone's notification permission, as the Alerts screen asks about it. */
export const notificationPermissions: PermissionGateway = {
  get: getNotificationPermission,
  request: requestNotificationPermission,
};

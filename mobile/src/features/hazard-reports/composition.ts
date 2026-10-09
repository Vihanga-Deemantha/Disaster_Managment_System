import { api, storage } from '@/shared/runtime';
import { ApiSessionGate } from './adapters/ApiSessionGate';
import { AsyncStorageQueueStorage } from './adapters/AsyncStorageQueueStorage';
import { AsyncStorageRunLog } from './adapters/AsyncStorageRunLog';
import { ExpoSyncNotifier, askNotificationPermission } from './adapters/ExpoSyncNotifier';
import type { DeliveryPermissionResult } from './adapters/ExpoSyncNotifier';
import { FileSystemPhotoStore } from './adapters/FileSystemPhotoStore';
import { NetInfoConnectivityMonitor } from './adapters/NetInfoConnectivityMonitor';
import { systemClock, uuidGenerator } from './adapters/system';
import { ExpoLocationProvider } from './adapters/ExpoLocationProvider';
import { ExpoPhotoPicker, type PhotoPicker } from './adapters/ExpoPhotoPicker';
import { createSubmitTransport } from './adapters/MultipartTransport';
import { HttpReportUploader } from './api/HttpReportUploader';
import type { LocationProvider } from './hooks/useCurrentLocation';
import type { SubmissionDeps } from './hooks/useReportSubmission';
import { OfflineReportQueue } from './offline/OfflineReportQueue';
import { SyncManager } from './offline/SyncManager';

export interface ReportDependencies extends SubmissionDeps {
  location: LocationProvider;
  photos: PhotoPicker;
  enableNotifications?: () => Promise<DeliveryPermissionResult>;
}
function build() {
  const files = new FileSystemPhotoStore();
  const queue = new OfflineReportQueue({
    storage: new AsyncStorageQueueStorage(storage),
    photos: files,
    clock: systemClock,
    ids: uuidGenerator,
  });
  const connectivity = new NetInfoConnectivityMonitor();
  const runLog = new AsyncStorageRunLog(storage);
  const sync = new SyncManager({
    queue,
    photos: files,
    connectivity,
    runLog,
    clock: systemClock,
    uploader: new HttpReportUploader(createSubmitTransport(api)),
    session: new ApiSessionGate(api),
    notifier: new ExpoSyncNotifier(storage),
  });
  return { api, queue, sync, connectivity, runLog };
}
export type HazardReportsRuntime = ReturnType<typeof build>;
let runtime: HazardReportsRuntime | undefined;
/** Headless-safe singleton; shares the app's API client and refresh single-flight. */
export function getHazardReportsRuntime(): HazardReportsRuntime {
  runtime ??= build();
  return runtime;
}

// Lazy forwarding keeps importing the OS task from eagerly constructing native storage/network state.
export const reportDependencies: ReportDependencies = {
  queue: {
    enqueue: (owner, draft) => getHazardReportsRuntime().queue.enqueue(owner, draft),
    get: (id) => getHazardReportsRuntime().queue.get(id),
    update: (id, patch) => getHazardReportsRuntime().queue.update(id, patch),
    dropPhoto: (id) => getHazardReportsRuntime().queue.dropPhoto(id),
  },
  sync: { submitNow: (id, choice) => getHazardReportsRuntime().sync.submitNow(id, choice) },
  location: new ExpoLocationProvider(),
  photos: new ExpoPhotoPicker(),
  enableNotifications: askNotificationPermission,
};

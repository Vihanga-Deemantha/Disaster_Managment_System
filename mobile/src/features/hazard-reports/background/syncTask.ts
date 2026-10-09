import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getHazardReportsRuntime } from '../composition';
import { isTaskSuccess } from '../offline/taskResult';
import type { SyncTaskStatus } from './taskStatus';

export const SYNC_TASK = 'safezone.hazard-reports.sync';
// Module scope is essential: index.ts imports this before Expo Router, including headless launches.
TaskManager.defineTask(SYNC_TASK, async ({ error }) => {
  if (error) return BackgroundTask.BackgroundTaskResult.Failed;
  try {
    const result = await getHazardReportsRuntime().sync.run('OS_TASK');
    return isTaskSuccess(result)
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function ensureSyncTaskRegistered(): Promise<SyncTaskStatus> {
  try {
    if (!(await TaskManager.isAvailableAsync())) return 'UNAVAILABLE';
    if ((await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Restricted)
      return 'RESTRICTED';
    if (!(await TaskManager.isTaskRegisteredAsync(SYNC_TASK)))
      await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
    return 'REGISTERED';
  } catch {
    return 'UNAVAILABLE';
  }
}

/** The native testing worker is unavailable in release/standalone preview builds. */
export async function triggerSyncTaskForTesting(): Promise<boolean> {
  if (!__DEV__) return false;
  try {
    return await BackgroundTask.triggerTaskWorkerForTestingAsync();
  } catch {
    return false;
  }
}

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getHazardReportsRuntime } from '../composition';
import {
  ensureSyncTaskRegistered,
  SYNC_TASK,
  triggerSyncTaskForTesting,
} from '../background/syncTask';

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn(),
  registerTaskAsync: jest.fn(),
  triggerTaskWorkerForTestingAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isAvailableAsync: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));
jest.mock('../composition', () => ({ getHazardReportsRuntime: jest.fn() }));
const execute = jest.mocked(TaskManager.defineTask).mock.calls[0][1];
beforeEach(() => {
  jest.mocked(TaskManager.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(false);
  jest.mocked(BackgroundTask.getStatusAsync).mockResolvedValue(2);
  jest.mocked(BackgroundTask.registerTaskAsync).mockClear();
});
describe('UC-3 A1: headless OS task', () => {
  it.each([undefined, 'OFFLINE', 'NO_SESSION', 'RETRY_LATER'] as const)(
    'defines a task without mounting UI and maps %s to the OS result',
    async (stoppedBy) => {
      const run = jest.fn(async () => ({
        trigger: 'OS_TASK',
        ranAt: 'now',
        uploaded: 0,
        remaining: 1,
        stoppedBy,
      }));
      jest.mocked(getHazardReportsRuntime).mockReturnValue({ sync: { run } } as never);
      expect(jest.mocked(TaskManager.defineTask).mock.calls[0][0]).toBe(SYNC_TASK);
      expect(await execute({} as never)).toBe(stoppedBy === 'RETRY_LATER' ? 2 : 1);
      expect(run).toHaveBeenCalledWith('OS_TASK');
    },
  );
  it('returns Failed if native storage or runtime creation throws', async () => {
    jest.mocked(getHazardReportsRuntime).mockImplementationOnce(() => {
      throw new Error('storage');
    });
    expect(await execute({} as never)).toBe(2);
  });
  it('registers once at a 15-minute minimum and respects unavailable/restricted platforms', async () => {
    expect(await ensureSyncTaskRegistered()).toBe('REGISTERED');
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(SYNC_TASK, {
      minimumInterval: 15,
    });
    jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);
    jest.mocked(BackgroundTask.registerTaskAsync).mockClear();
    expect(await ensureSyncTaskRegistered()).toBe('REGISTERED');
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
    jest.mocked(BackgroundTask.getStatusAsync).mockResolvedValue(1);
    expect(await ensureSyncTaskRegistered()).toBe('RESTRICTED');
    jest.mocked(TaskManager.isAvailableAsync).mockResolvedValue(false);
    expect(await ensureSyncTaskRegistered()).toBe('UNAVAILABLE');
  });
  it('catches registration failures and refuses the testing worker in release builds', async () => {
    jest.mocked(BackgroundTask.registerTaskAsync).mockRejectedValueOnce(new Error('restricted'));
    expect(await ensureSyncTaskRegistered()).toBe('UNAVAILABLE');
    const globals = globalThis as typeof globalThis & { __DEV__: boolean };
    const original = globals.__DEV__;
    globals.__DEV__ = false;
    expect(await triggerSyncTaskForTesting()).toBe(false);
    globals.__DEV__ = original;
  });
});

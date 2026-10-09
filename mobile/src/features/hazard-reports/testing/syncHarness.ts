import { OfflineReportQueue } from '../offline/OfflineReportQueue';
import { SyncManager } from '../offline/SyncManager';
import type { QueuedReport, SyncRunResult, UploadOptions, UploadOutcome } from '../offline/types';
import { FakePhotoStore, FixedClock, InMemoryQueueStorage, SequentialIds } from './fakes';

export const delivered: Extract<UploadOutcome, { kind: 'DELIVERED' }> = {
  kind: 'DELIVERED',
  via: 'CREATED',
  reportId: 'server-1',
};
export function syncHarness() {
  const storage = new InMemoryQueueStorage();
  const photos = new FakePhotoStore();
  const clock = new FixedClock();
  const queueDeps = { storage, photos, clock, ids: new SequentialIds() };
  const queue = new OfflineReportQueue(queueDeps);
  const calls: { entry: QueuedReport; options: UploadOptions }[] = [];
  const outcomes: UploadOutcome[] = [];
  const uploader = {
    upload: jest.fn(async (entry: QueuedReport, options: UploadOptions): Promise<UploadOutcome> => {
      calls.push({ entry, options });
      return outcomes.shift() ?? delivered;
    }),
  };
  const connectivity = { isOnline: jest.fn(async () => true), onReconnect: () => () => undefined };
  const session = { currentUserId: jest.fn(async (): Promise<string | undefined> => 'citizen-1') };
  const sent: number[] = [];
  const signIn: number[] = [];
  const notifier = {
    reportsSent: async (count: number) => {
      sent.push(count);
    },
    signInNeeded: async (count: number) => {
      signIn.push(count);
    },
  };
  const runs: SyncRunResult[] = [];
  const runLog = {
    record: async (run: SyncRunResult) => {
      runs.push(run);
    },
    last: async () => runs.at(-1),
  };
  const deps = { queue, photos, clock, uploader, connectivity, session, notifier, runLog };
  return {
    ...deps,
    storage,
    calls,
    outcomes,
    sent,
    signIn,
    runs,
    sync: new SyncManager(deps),
    restart: () => new SyncManager({ ...deps, queue: new OfflineReportQueue(queueDeps) }),
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

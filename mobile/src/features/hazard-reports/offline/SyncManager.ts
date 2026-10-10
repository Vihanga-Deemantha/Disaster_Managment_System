import type { OfflineReportQueue } from './OfflineReportQueue';
import type {
  Clock,
  ConnectivityMonitor,
  PhotoStore,
  ReportUploader,
  SessionGate,
  SyncNotifier,
  SyncRunLog,
} from './ports';
import type {
  QueueState,
  QueuedReport,
  SyncRunResult,
  SyncStop,
  SyncTrigger,
  UploadOptions,
  UploadOutcome,
} from './types';

export interface SyncDeps {
  queue: OfflineReportQueue;
  photos: PhotoStore;
  uploader: ReportUploader;
  connectivity: ConnectivityMonitor;
  session: SessionGate;
  notifier: SyncNotifier;
  runLog: SyncRunLog;
  clock: Clock;
}
export type SubmitNowResult = UploadOutcome | { kind: 'SAVED_OFFLINE' } | { kind: 'ALREADY_SENT' };
type AttemptResult = UploadOutcome | { kind: 'ALREADY_SENT' };
type Gate = { userId: string } | { stop: SyncStop };
const STOPS: Partial<Record<AttemptResult['kind'], SyncStop>> = {
  RETRY: 'RETRY_LATER',
  AUTH_REQUIRED: 'NO_SESSION',
};
const WAITING: QueueState[] = ['QUEUED', 'UPLOADING'];

/** Stateless delivery over a journal. One lane serializes interactive and background attempts. */
export class SyncManager {
  private lane: Promise<unknown> = Promise.resolve();
  private pending?: Promise<SyncRunResult>;
  constructor(private readonly deps: SyncDeps) {}

  run(trigger: SyncTrigger): Promise<SyncRunResult> {
    this.pending ??= this.exclusive(() => this.drain(trigger)).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  submitNow(
    clientReportId: string,
    duplicateAction?: UploadOptions['duplicateAction'],
  ): Promise<SubmitNowResult> {
    return this.exclusive(() => this.submitOne(clientReportId, duplicateAction));
  }

  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const next = this.lane.then(job);
    this.lane = next.catch(() => undefined);
    return next;
  }

  private async drain(trigger: SyncTrigger): Promise<SyncRunResult> {
    const gate = await this.gate();
    if ('stop' in gate) return this.finish(trigger, 0, gate.stop);
    let uploaded = 0;
    let stoppedBy: SyncStop | undefined;
    const states: QueueState[] =
      trigger === 'OS_TASK' ? [...WAITING, 'AWAITING_DECISION'] : WAITING;
    const due = (await this.deps.queue.list()).filter(
      (e) => e.ownerId === gate.userId && states.includes(e.state),
    );
    for (const entry of due) {
      const outcome = await this.attempt(entry, {
        syncedFromOffline: true,
        duplicateAction: entry.duplicateAction,
      });
      if (outcome.kind === 'DELIVERED') uploaded += 1;
      stoppedBy = STOPS[outcome.kind];
      if (stoppedBy) break;
    }
    return this.finish(trigger, uploaded, stoppedBy, gate.userId);
  }

  private async submitOne(
    id: string,
    duplicateAction?: UploadOptions['duplicateAction'],
  ): Promise<SubmitNowResult> {
    const entry = await this.deps.queue.get(id);
    if (!entry) return { kind: 'ALREADY_SENT' };
    const gate = await this.gate();
    if ('stop' in gate)
      return gate.stop === 'NO_SESSION' ? { kind: 'AUTH_REQUIRED' } : { kind: 'SAVED_OFFLINE' };
    if (entry.ownerId !== gate.userId) return { kind: 'AUTH_REQUIRED' };
    const choice = duplicateAction ?? entry.duplicateAction;
    const outcome = await this.attempt(entry, {
      syncedFromOffline: false,
      duplicateAction: choice,
    });
    return outcome.kind === 'RETRY' ? { kind: 'SAVED_OFFLINE' } : outcome;
  }

  private async gate(): Promise<Gate> {
    try {
      if (!(await this.deps.connectivity.isOnline())) return { stop: 'OFFLINE' };
      const userId = await this.deps.session.currentUserId();
      return userId ? { userId } : { stop: 'NO_SESSION' };
    } catch {
      return { stop: 'OFFLINE' };
    }
  }

  private async attempt(entry: QueuedReport, options: UploadOptions): Promise<AttemptResult> {
    const sending = await this.markUploading(entry, options.duplicateAction);
    if (!sending) return { kind: 'ALREADY_SENT' };
    let outcome: UploadOutcome;
    try {
      outcome = await this.deps.uploader.upload(sending, options);
    } catch {
      outcome = { kind: 'RETRY' };
    }
    await this.settle(sending.clientReportId, outcome);
    return outcome;
  }

  private async markUploading(
    entry: QueuedReport,
    duplicateAction?: UploadOptions['duplicateAction'],
  ): Promise<QueuedReport | undefined> {
    const photoLost =
      entry.photo !== undefined && !(await this.deps.photos.exists(entry.photo.uri));
    return this.deps.queue.update(entry.clientReportId, {
      state: 'UPLOADING',
      attempts: entry.attempts + 1,
      lastAttemptAt: this.deps.clock.now().toISOString(),
      duplicateAction,
      existingReportId: undefined,
      problem: undefined,
      ...(photoLost ? { photo: undefined } : {}),
    });
  }

  private async settle(id: string, outcome: UploadOutcome): Promise<void> {
    const { queue } = this.deps;
    switch (outcome.kind) {
      case 'DELIVERED':
        await queue.remove(id);
        break;
      case 'DUPLICATE_SUSPECTED':
        await queue.update(id, {
          state: 'AWAITING_DECISION',
          existingReportId: outcome.existingReportId,
        });
        break;
      case 'REJECTED':
        await queue.update(id, {
          state: 'NEEDS_ATTENTION',
          problem: { code: outcome.code, message: outcome.message },
        });
        break;
      default:
        await queue.update(id, { state: 'QUEUED' });
    }
  }

  private async finish(
    trigger: SyncTrigger,
    uploaded: number,
    stoppedBy?: SyncStop,
    ownerId?: string,
  ): Promise<SyncRunResult> {
    const remaining = (await this.deps.queue.list()).filter(
      (e) => ownerId === undefined || e.ownerId === ownerId,
    ).length;
    const result = {
      trigger,
      uploaded,
      remaining,
      stoppedBy,
      ranAt: this.deps.clock.now().toISOString(),
    };
    await this.deps.runLog.record(result);
    if (trigger === 'OS_TASK') await this.announce(result);
    return result;
  }

  private async announce({ uploaded, remaining, stoppedBy }: SyncRunResult): Promise<void> {
    if (uploaded > 0) await this.deps.notifier.reportsSent(uploaded);
    if (stoppedBy === 'NO_SESSION' && remaining > 0)
      await this.deps.notifier.signInNeeded(remaining);
  }
}

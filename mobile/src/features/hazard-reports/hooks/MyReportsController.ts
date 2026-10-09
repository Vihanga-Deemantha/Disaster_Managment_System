import type { MyReportsCache } from '../adapters/MyReportsCache';
import type { MyReportsApi } from '../api/MyReportsApi';
import { mergeMyReports, type MyReportItem, type RemoteReport } from '../domain/mergeMyReports';
import type { OfflineReportQueue } from '../offline/OfflineReportQueue';
import type { ConnectivityMonitor, SyncRunLog } from '../offline/ports';
import type { SyncManager } from '../offline/SyncManager';
import type { QueuedReport, SyncRunResult } from '../offline/types';

export interface MyReportsDependencies {
  queue: Pick<
    OfflineReportQueue,
    'enqueue' | 'list' | 'subscribe' | 'get' | 'update' | 'dropPhoto' | 'remove'
  >;
  sync: Pick<SyncManager, 'run' | 'submitNow'>;
  connectivity: ConnectivityMonitor;
  reports: Pick<MyReportsApi, 'list'>;
  cache: Pick<MyReportsCache, 'load' | 'save'>;
  runLog: SyncRunLog;
}
export interface MyReportsState {
  items: MyReportItem[];
  local: QueuedReport[];
  ready: boolean;
  refreshing: boolean;
  offline: boolean;
  problem?: 'REMOTE' | 'STORAGE';
  lastRun?: SyncRunResult;
}
/** One owner and one refresh lane; late responses cannot update a disposed screen. */
export class MyReportsController {
  private state: MyReportsState = {
    items: [],
    local: [],
    ready: false,
    refreshing: false,
    offline: false,
  };
  private remote: RemoteReport[] = [];
  private live = false;
  private pending?: Promise<void>;
  private hydration: Promise<void> = Promise.resolve();
  private dirty = false;
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly ownerId: string,
    private readonly deps: MyReportsDependencies,
  ) {}
  snapshot = (): MyReportsState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  start(): () => void {
    this.live = true;
    this.hydration = this.initialize();
    void this.reload();
    const offQueue = this.deps.queue.subscribe(() => {
      this.dirty = true;
      void this.readLocal().then(() => {
        if (!this.pending) void this.reload();
      });
    });
    const offNetwork = this.deps.connectivity.onReconnect(() => {
      void this.reload();
    });
    return () => {
      this.live = false;
      offQueue();
      offNetwork();
    };
  }
  private async initialize(): Promise<void> {
    this.remote = await this.deps.cache.load(this.ownerId);
    await this.readLocal();
  }
  private publish(patch: Partial<MyReportsState>): void {
    if (!this.live) return;
    this.state = { ...this.state, ...patch };
    this.state.items = mergeMyReports(this.state.local, this.remote);
    for (const listener of this.listeners) listener();
  }
  private async readLocal(): Promise<void> {
    try {
      const local = (await this.deps.queue.list()).filter(
        (entry) => entry.ownerId === this.ownerId,
      );
      this.publish({ local });
    } catch {
      this.publish({ problem: 'STORAGE' });
    }
  }
  reload = (manual = false): Promise<void> => {
    if (!this.live) return Promise.resolve();
    this.pending ??= this.hydration
      .then(() => {
        this.dirty = false;
        return this.fetch(manual);
      })
      .finally(() => {
        this.pending = undefined;
        if (this.dirty) void this.reload();
      });
    return this.pending;
  };
  private async fetch(manual: boolean): Promise<void> {
    this.publish({ refreshing: true, problem: undefined });
    try {
      if (manual) await this.deps.sync.run('MANUAL');
      const online = await this.deps.connectivity.isOnline();
      this.publish({ offline: !online });
      if (online) await this.readRemote();
      await this.readLocal();
      this.publish({ lastRun: await this.deps.runLog.last() });
    } catch {
      this.publish({ problem: 'REMOTE' });
    } finally {
      this.publish({ ready: true, refreshing: false });
    }
  }
  private async readRemote(): Promise<void> {
    const reports = await this.deps.reports.list(this.ownerId);
    if (!this.live) return;
    this.remote = reports;
    this.publish({});
    await this.deps.cache.save(this.ownerId, reports);
  }
}

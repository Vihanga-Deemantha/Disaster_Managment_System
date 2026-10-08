import type {
  AlertNotifier,
  AlertsGateway,
  Clock,
  InboxStorage,
  Scheduler,
  StoredInbox,
} from './ports';
import { InboxUnavailable, type Alert, type InboxProblem, type InboxSnapshot } from './types';
import { clockSkewMs, newestFirst, serverNowMs, validityAt } from './validity';

/** "polls `/api/me/alerts` every 15 s while the app is open". */
export const POLL_INTERVAL_MS = 15_000;
/** A burst of new alerts (a new phone, a long absence) buzzes the newest few, not the whole backlog. */
export const MAX_BANNERS_PER_POLL = 3;
/** How many alert ids are remembered for "already announced" and "already read" (the server sends 100). */
export const REMEMBERED_IDS = 500;

export interface InboxState {
  /** Newest first. */
  alerts: readonly Alert[];
  readIds: ReadonlySet<string>;
  unreadCount: number;
  /** A fetch is under way (a background poll or a pull to refresh). */
  syncing: boolean;
  /** Why the last fetch failed; cleared by the next one that works. */
  problem?: InboxProblem;
  /** ISO time of the last successful fetch. */
  lastSyncedAt?: string;
  /** Add this to the phone's clock to get the server's. */
  skewMs: number;
  /** False until what was saved on the phone has been read. */
  ready: boolean;
}

export interface PollerDeps {
  gateway: AlertsGateway;
  notifier: AlertNotifier;
  storage: InboxStorage;
  clock: Clock;
  scheduler: Scheduler;
  intervalMs?: number;
}

const INITIAL: InboxState = {
  alerts: [],
  readIds: new Set(),
  unreadCount: 0,
  syncing: false,
  skewMs: 0,
  ready: false,
};

/** Appends ids without repeats and keeps only the most recent `REMEMBERED_IDS`. */
function remember(known: readonly string[], added: readonly string[]): string[] {
  const merged = [...known, ...added.filter((id) => !known.includes(id))];
  return merged.slice(-REMEMBERED_IDS);
}

const problemOf = (error: unknown): InboxProblem =>
  error instanceof InboxUnavailable ? error.reason : 'SERVER';

/**
 * The phone's alert inbox: polls the API, works out which alerts are new, tells the citizen about
 * them, and remembers what was announced and what was read. Everything it touches arrives through a
 * port (API client, notifier, storage, clock, timer), so it runs and is tested without React Native.
 *
 * What "new" means: an alert whose id has never been announced on this phone for this citizen. New
 * alerts that are still valid get a banner (at most `MAX_BANNERS_PER_POLL` per poll, oldest first so
 * the newest ends on top); ones that already expired, or beyond the cap, are marked as announced
 * without a banner, so they never come back to buzz later.
 */
export class AlertInboxPoller {
  private state: InboxState = INITIAL;
  private announcedIds: string[] = [];
  private readonly listeners = new Set<() => void>();
  private cancelSchedule: (() => void) | undefined;
  private inFlight: Promise<void> | undefined;
  private hydrated: Promise<void> | undefined;

  constructor(private readonly deps: PollerDeps) {}

  readonly getState = (): InboxState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** Fetches at once, then every interval. Safe to call twice. */
  start(): void {
    if (this.cancelSchedule) return;
    void this.pollNow();
    this.cancelSchedule = this.deps.scheduler.every(
      this.deps.intervalMs ?? POLL_INTERVAL_MS,
      () => void this.pollNow(),
    );
  }

  stop(): void {
    this.cancelSchedule?.();
    this.cancelSchedule = undefined;
  }

  /** Fetches now (pull to refresh). A fetch already under way is joined, never doubled. */
  pollNow(): Promise<void> {
    this.inFlight ??= this.poll().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** The citizen opened this alert. */
  async markRead(alertId: string): Promise<void> {
    await this.hydrate();
    if (this.state.readIds.has(alertId)) return;
    const readIds = new Set(remember([...this.state.readIds], [alertId]));
    this.publish({ readIds });
    await this.persist();
  }

  private hydrate(): Promise<void> {
    this.hydrated ??= this.loadSaved();
    return this.hydrated;
  }

  private async loadSaved(): Promise<void> {
    const saved = await this.deps.storage.load().catch(() => null);
    if (saved) {
      this.announcedIds = saved.announcedIds;
      this.publish({
        alerts: [...saved.alerts].sort(newestFirst),
        readIds: new Set(saved.readIds),
        skewMs: saved.skewMs,
        lastSyncedAt: saved.lastSyncedAt,
        ready: true,
      });
    } else {
      this.publish({ ready: true });
    }
  }

  private async poll(): Promise<void> {
    await this.hydrate();
    this.publish({ syncing: true });
    try {
      await this.apply(await this.deps.gateway.fetchInbox());
    } catch (error) {
      this.publish({ syncing: false, problem: problemOf(error) });
    }
  }

  private async apply(snapshot: InboxSnapshot): Promise<void> {
    const phoneNow = this.deps.clock.now();
    const skewMs = clockSkewMs(snapshot.serverTime, phoneNow.getTime());
    const alerts = [...snapshot.alerts].sort(newestFirst);
    const fresh = alerts.filter((alert) => !this.announcedIds.includes(alert.alertId));
    await this.announce(fresh, serverNowMs(phoneNow.getTime(), skewMs));
    // Oldest first, so when the list is full it is the oldest ids that are forgotten.
    this.announcedIds = remember(this.announcedIds, fresh.map((alert) => alert.alertId).reverse());
    this.publish({
      alerts,
      skewMs,
      syncing: false,
      problem: undefined,
      lastSyncedAt: phoneNow.toISOString(),
    });
    await this.persist();
  }

  /** Banners for the valid new alerts, oldest first; one that fails to show never stops the others. */
  private async announce(fresh: readonly Alert[], serverNow: number): Promise<void> {
    const worthIt = fresh.filter((alert) => validityAt(alert, serverNow) !== 'expired');
    const newest = worthIt.slice(0, MAX_BANNERS_PER_POLL).reverse();
    for (const alert of newest) {
      try {
        await this.deps.notifier.announce(alert);
      } catch {
        // No permission, or the system refused: the alert is still in the list with its unread dot.
      }
    }
  }

  private publish(changes: Partial<InboxState>): void {
    const next = { ...this.state, ...changes };
    const unreadCount = next.alerts.filter((alert) => !next.readIds.has(alert.alertId)).length;
    this.state = { ...next, unreadCount };
    this.listeners.forEach((listener) => listener());
  }

  private persist(): Promise<void> {
    const { alerts, skewMs, lastSyncedAt, readIds } = this.state;
    const saved: StoredInbox = {
      alerts: [...alerts],
      skewMs,
      announcedIds: this.announcedIds,
      readIds: [...readIds],
      ...(lastSyncedAt === undefined ? {} : { lastSyncedAt }),
    };
    // Not being able to keep the inbox for next time must never look like a failed fetch.
    return this.deps.storage.save(saved).catch(() => undefined);
  }
}

import type { Alert, InboxSnapshot } from './types';

/** Where the inbox comes from. Throws `InboxUnavailable` (with a reason) when it cannot be fetched. */
export interface AlertsGateway {
  fetchInbox(): Promise<InboxSnapshot>;
}

/** Puts a banner on the phone for an alert (the real one schedules a local notification). */
export interface AlertNotifier {
  announce(alert: Alert): Promise<void>;
}

/** Everything about one citizen's inbox that survives closing the app. */
export interface StoredInbox {
  alerts: Alert[];
  /** How far the phone's clock was behind the server's at the last fetch (milliseconds). */
  skewMs: number;
  /** ISO time of the last successful fetch. */
  lastSyncedAt?: string;
  /** Alerts the app has already told the citizen about (or deliberately stayed quiet about). */
  announcedIds: string[];
  /** Alerts the citizen has opened. */
  readIds: string[];
}

export interface InboxStorage {
  load(): Promise<StoredInbox | null>;
  save(state: StoredInbox): Promise<void>;
}

export interface Clock {
  now(): Date;
}

/** Runs a task every so often until cancelled; the poller never touches timers itself. */
export interface Scheduler {
  every(intervalMs: number, task: () => void): () => void;
}

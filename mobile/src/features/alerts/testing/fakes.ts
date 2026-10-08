import type {
  AlertNotifier,
  AlertsGateway,
  Clock,
  InboxStorage,
  Scheduler,
  StoredInbox,
} from '../domain/ports';
import type { Alert, InboxSnapshot } from '../domain/types';

export const HOUR = 3_600_000;
export const MINUTE = 60_000;
/** 14:30 in Colombo on 8 October 2026. */
export const NOW = new Date('2026-10-08T09:00:00.000Z');

export const at = (offsetMs: number): string => new Date(NOW.getTime() + offsetMs).toISOString();

/** A flood warning for Gampaha that reached the citizen now and is valid for a day. */
export const anAlert = (overrides: Partial<Alert> = {}): Alert => ({
  alertId: 'A-1',
  warningId: 'W-1',
  hazardType: 'FLOOD',
  severity: 'HIGH',
  message: 'Flood warning: water is rising in Gampaha district. Move to higher ground now.',
  language: 'EN',
  areas: [{ areaId: 'GAMPAHA', type: 'DISTRICT', name: 'Gampaha', district: 'GAMPAHA' }],
  validFrom: at(0),
  validTo: at(24 * HOUR),
  deliveredAt: at(0),
  ...overrides,
});

export const snapshotOf = (
  alerts: Alert[],
  serverTime: string = NOW.toISOString(),
): InboxSnapshot => ({
  alerts,
  serverTime,
});

export class FixedClock implements Clock {
  constructor(private current: Date = NOW) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

type Answer = InboxSnapshot | Error;

/** Answers each fetch from a list (the last answer repeats), and can hold a fetch open. */
export class FakeGateway implements AlertsGateway {
  calls = 0;
  private release: (() => void) | undefined;
  private held = false;

  constructor(private readonly answers: Answer[] = [snapshotOf([])]) {}

  /** The next answers; the last one repeats. */
  respondWith(...answers: Answer[]): void {
    this.answers.splice(0, this.answers.length, ...answers);
    this.calls = 0;
  }

  /** The next fetch waits until `letThrough` is called. */
  hold(): void {
    this.held = true;
  }

  letThrough(): void {
    this.held = false;
    this.release?.();
  }

  async fetchInbox(): Promise<InboxSnapshot> {
    const answer = this.answers[Math.min(this.calls, this.answers.length - 1)] as Answer;
    this.calls += 1;
    if (this.held) await new Promise<void>((resolve) => (this.release = resolve));
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

export class RecordingNotifier implements AlertNotifier {
  readonly announced: Alert[] = [];
  private readonly refused = new Set<string>();

  failFor(...alertIds: string[]): void {
    alertIds.forEach((id) => this.refused.add(id));
  }

  async announce(alert: Alert): Promise<void> {
    if (this.refused.has(alert.alertId)) throw new Error('notifications are not allowed');
    this.announced.push(alert);
  }

  get ids(): string[] {
    return this.announced.map((alert) => alert.alertId);
  }
}

export class MemoryInboxStorage implements InboxStorage {
  loads = 0;
  readonly saves: StoredInbox[] = [];

  constructor(public stored: StoredInbox | null = null) {}

  async load(): Promise<StoredInbox | null> {
    this.loads += 1;
    return this.stored;
  }

  async save(state: StoredInbox): Promise<void> {
    this.saves.push(state);
    this.stored = state;
  }
}

/** A timer the test drives by hand: nothing happens until `tick()`. */
export class ManualScheduler implements Scheduler {
  intervals: number[] = [];
  cancelled = 0;
  private task: (() => void) | undefined;

  every(intervalMs: number, task: () => void): () => void {
    this.intervals.push(intervalMs);
    this.task = task;
    return () => {
      this.cancelled += 1;
      this.task = undefined;
    };
  }

  tick(): void {
    this.task?.();
  }

  get running(): boolean {
    return this.task !== undefined;
  }
}

/** Lets pending promises finish: a poll takes several turns of the event loop. */
export const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

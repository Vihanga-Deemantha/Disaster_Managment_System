import type { ValidReportDraft } from '../domain/types';
import type { Clock, IdGenerator, PhotoStore, QueueStorage } from '../offline/ports';
import type { QueuedReport } from '../offline/types';

export class InMemoryQueueStorage implements QueueStorage {
  private entries: QueuedReport[] = [];
  async load(): Promise<QueuedReport[]> {
    return JSON.parse(JSON.stringify(this.entries)) as QueuedReport[];
  }
  async save(entries: QueuedReport[]): Promise<void> {
    this.entries = JSON.parse(JSON.stringify(entries)) as QueuedReport[];
  }
}
export class FakePhotoStore implements PhotoStore {
  readonly kept = new Map<string, string>();
  readonly discarded: string[] = [];
  async keep(sourceUri: string, name: string): Promise<string> {
    const uri = `file:///documents/${name}`;
    this.kept.set(uri, sourceUri);
    return uri;
  }
  async exists(uri: string): Promise<boolean> {
    return this.kept.has(uri);
  }
  async discard(uri: string): Promise<void> {
    this.discarded.push(uri);
    this.kept.delete(uri);
  }
  lose(uri: string): void {
    this.kept.delete(uri);
  }
}
export class FixedClock implements Clock {
  constructor(private instant = new Date('2026-10-09T03:30:00.000Z').getTime()) {}
  now(): Date {
    return new Date(this.instant);
  }
  advance(ms: number): void {
    this.instant += ms;
  }
}
export class SequentialIds implements IdGenerator {
  private count = 0;
  constructor(private readonly prefix = 'client') {}
  next(): string {
    return `${this.prefix}-${++this.count}`;
  }
}
export function aDraft(overrides: Partial<ValidReportDraft> = {}): ValidReportDraft {
  return {
    hazardType: 'FLOOD',
    description: 'Water rising',
    location: { lat: 6.5854, lng: 79.9607, source: 'GPS' },
    ...overrides,
  };
}

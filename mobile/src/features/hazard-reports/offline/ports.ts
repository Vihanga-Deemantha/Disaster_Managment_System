import type { QueuedReport, SyncRunResult, UploadOptions, UploadOutcome } from './types';

export interface Clock {
  now(): Date;
}
export interface IdGenerator {
  next(): string;
}
export interface QueueStorage {
  load(): Promise<QueuedReport[]>;
  save(entries: QueuedReport[]): Promise<void>;
}
export interface PhotoStore {
  keep(sourceUri: string, name: string): Promise<string>;
  exists(uri: string): Promise<boolean>;
  discard(uri: string): Promise<void>;
}
export interface ConnectivityMonitor {
  isOnline(): Promise<boolean>;
  onReconnect(listener: () => void): () => void;
  /** Foreground status banners need both directions; headless ports may omit this. */
  onChange?(listener: (online: boolean) => void): () => void;
}
export interface SessionGate {
  currentUserId(): Promise<string | undefined>;
}
export interface ReportUploader {
  upload(entry: QueuedReport, options: UploadOptions): Promise<UploadOutcome>;
}
export interface SyncNotifier {
  reportsSent(count: number): Promise<void>;
  signInNeeded(count: number): Promise<void>;
}
export interface SyncRunLog {
  record(result: SyncRunResult): Promise<void>;
  last(): Promise<SyncRunResult | undefined>;
}

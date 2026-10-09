import type { DraftLocation, PhotoToSend } from '../domain/types';
import type { ReportHazardType } from '../domain/reportRules';

export type QueueState = 'QUEUED' | 'UPLOADING' | 'AWAITING_DECISION' | 'NEEDS_ATTENTION';
export interface QueuedReport {
  clientReportId: string;
  ownerId: string;
  hazardType: ReportHazardType;
  description: string;
  location: DraftLocation;
  capturedAt: string;
  photo?: PhotoToSend;
  state: QueueState;
  attempts: number;
  lastAttemptAt?: string;
  existingReportId?: string;
  duplicateAction?: 'NEW' | 'UPDATE';
  problem?: { code: string; message: string };
}
export type UploadOutcome =
  | {
      kind: 'DELIVERED';
      via: 'CREATED' | 'ALREADY_RECEIVED' | 'UPDATED_EXISTING';
      reportId: string;
    }
  | { kind: 'DUPLICATE_SUSPECTED'; existingReportId: string }
  | { kind: 'REJECTED'; code: string; message: string }
  | { kind: 'AUTH_REQUIRED' }
  | { kind: 'RETRY' };
export interface UploadOptions {
  syncedFromOffline: boolean;
  duplicateAction?: 'NEW' | 'UPDATE';
}
export type SyncTrigger = 'RECONNECT' | 'APP_FOREGROUND' | 'MANUAL' | 'OS_TASK';
export type SyncStop = 'OFFLINE' | 'NO_SESSION' | 'RETRY_LATER';
export interface SyncRunResult {
  trigger: SyncTrigger;
  ranAt: string;
  uploaded: number;
  remaining: number;
  stoppedBy?: SyncStop;
}

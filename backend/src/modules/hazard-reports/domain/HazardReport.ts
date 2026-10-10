import { ConflictError, ValidationError } from '@shared/errors/DomainError';
import type {
  ReportHazardType,
  ReportLocation,
  ReportPhoto,
  ReportStatus,
  ReporterType,
} from './types';

export interface HazardReportState {
  id: string;
  clientReportId: string;
  reporterId: string;
  reporterType: ReporterType;
  hazardType: ReportHazardType;
  description: string;
  photo?: ReportPhoto;
  location: ReportLocation;
  capturedAt: Date;
  receivedAt: Date;
  syncedFromOffline: boolean;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  clusterId?: string;
}

export type NewHazardReport = Omit<
  HazardReportState,
  'status' | 'reviewedBy' | 'reviewedAt' | 'rejectionReason' | 'clusterId'
>;

export interface Amendment {
  description: string;
  photo?: ReportPhoto;
  capturedAt: Date;
}

export class HazardReport {
  private constructor(private state: HazardReportState) {}

  /** UC-3 step 7: every report starts Pending. */
  static submit(input: NewHazardReport): HazardReport {
    return new HazardReport({ ...input, status: 'PENDING' });
  }

  /** Rebuilds a stored report. */
  static restore(state: HazardReportState): HazardReport {
    return new HazardReport({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get status(): ReportStatus {
    return this.state.status;
  }

  get clusterId(): string | undefined {
    return this.state.clusterId;
  }

  get reporterId(): string {
    return this.state.reporterId;
  }

  get location(): ReportLocation {
    return this.state.location;
  }

  get capturedAt(): Date {
    return this.state.capturedAt;
  }

  snapshot(): HazardReportState {
    return { ...this.state };
  }

  /** UC-3 steps 13–14. */
  verify(officerId: string, now: Date): void {
    this.assertPending();
    this.state = { ...this.state, status: 'VERIFIED', reviewedBy: officerId, reviewedAt: now };
  }

  /** UC-3 A2: a reason is mandatory (H8); the report is kept for audit. */
  reject(officerId: string, reason: string, now: Date): void {
    this.assertPending();
    const rejectionReason = reason.trim();
    if (!rejectionReason) throw new ValidationError([{ field: 'reason', code: 'REASON_REQUIRED' }]);
    this.state = {
      ...this.state,
      status: 'REJECTED',
      reviewedBy: officerId,
      reviewedAt: now,
      rejectionReason,
    };
  }

  /** UC-3 E3 "update existing": keeps the earliest capture time and the old photo unless a new one came. */
  amend(change: Amendment): void {
    this.assertPending();
    const capturedAt =
      change.capturedAt < this.state.capturedAt ? change.capturedAt : this.state.capturedAt;
    this.state = {
      ...this.state,
      description: change.description,
      photo: change.photo ?? this.state.photo,
      capturedAt,
    };
  }

  assignTo(clusterId: string): void {
    this.state = { ...this.state, clusterId };
  }

  private assertPending(): void {
    if (this.state.status !== 'PENDING') {
      throw new ConflictError('REPORT_ALREADY_REVIEWED', 'This report has already been reviewed.');
    }
  }
}

import type { AuditLog } from '@shared/audit/AuditLog';
import type { Role } from '@shared/contracts/enums';
import { ConflictError, ValidationError } from '@shared/errors/DomainError';
import type { IdGenerator } from '@shared/ids/IdGenerator';
import type { Clock } from '@shared/time/Clock';
import type { ClusteringConfig } from '../domain/ClusteringConfig';
import type { DuplicateDetector } from '../domain/DuplicateDetector';
import { HazardReport } from '../domain/HazardReport';
import type { PhotoValidator } from '../domain/PhotoValidator';
import type { ReportHazardType, ReportLocation, ReportPhoto, UploadedPhoto } from '../domain/types';
import type { ClusteringService } from './ClusteringService';
import {
  DuplicateClientReportError,
  type HazardReportRepository,
  type PhotoStorage,
} from './ports';

export interface SubmitReportCommand {
  reporterId: string;
  reporterRole: Extract<Role, 'CITIZEN' | 'COMMUNITY_VOLUNTEER'>;
  clientReportId: string;
  hazardType: ReportHazardType;
  description: string;
  location: ReportLocation;
  capturedAt: Date;
  photo?: UploadedPhoto;
  duplicateAction?: 'NEW' | 'UPDATE';
  syncedFromOffline: boolean;
}

export type SubmitOutcome = 'CREATED' | 'ALREADY_RECEIVED' | 'UPDATED_EXISTING';

export interface SubmitResult {
  outcome: SubmitOutcome;
  report: HazardReport;
}

export interface SubmissionDeps {
  reports: HazardReportRepository;
  photos: PhotoStorage;
  clustering: Pick<ClusteringService, 'assign'>;
  detector: DuplicateDetector;
  photoValidator: PhotoValidator;
  config: Pick<ClusteringConfig, 'capturedAtSkewMs'>;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditLog;
}

export class ReportSubmissionService {
  constructor(private readonly deps: SubmissionDeps) {}

  /** UC-3 steps 7–10; A1 (a replayed upload is acknowledged, not repeated: H7); A3; E2; E3. */
  async submit(command: SubmitReportCommand): Promise<SubmitResult> {
    const { reports, photoValidator, detector } = this.deps;
    const received = await reports.findByClientReportId(command.reporterId, command.clientReportId);
    if (received) return { outcome: 'ALREADY_RECEIVED', report: received };

    this.assertNotFromTheFuture(command.capturedAt);
    if (command.photo) photoValidator.assertValid(command.photo);

    const duplicate = detector.find(command, await reports.findByReporter(command.reporterId));
    if (duplicate && command.duplicateAction !== 'NEW') {
      return this.resolveDuplicate(duplicate, command);
    }
    return this.create(command);
  }

  /** UC-3 E3: online the reporter is asked; a report synced from offline is merged automatically (H6). */
  private async resolveDuplicate(
    existing: HazardReport,
    command: SubmitReportCommand,
  ): Promise<SubmitResult> {
    if (command.duplicateAction !== 'UPDATE' && !command.syncedFromOffline) {
      throw new ConflictError('DUPLICATE_SUSPECTED', 'You reported this a moment ago.', {
        existingReportId: existing.id,
      });
    }
    const { photos, ids, reports } = this.deps;
    const photo = command.photo ? await photos.save(ids.next(), command.photo) : undefined;
    existing.amend({ description: command.description, photo, capturedAt: command.capturedAt });
    await reports.save(existing);
    await this.record('hazard-report.updated', existing, command);
    return { outcome: 'UPDATED_EXISTING', report: existing };
  }

  private async create(command: SubmitReportCommand): Promise<SubmitResult> {
    const { reports, photos, clustering, ids, clock } = this.deps;
    const id = ids.next();
    const photo = command.photo ? await photos.save(id, command.photo) : undefined;
    const report = HazardReport.submit({
      id,
      clientReportId: command.clientReportId,
      reporterId: command.reporterId,
      reporterType: command.reporterRole === 'COMMUNITY_VOLUNTEER' ? 'VOLUNTEER' : 'CITIZEN',
      hazardType: command.hazardType,
      description: command.description,
      photo,
      location: command.location,
      capturedAt: command.capturedAt,
      receivedAt: clock.now(),
      syncedFromOffline: command.syncedFromOffline,
    });
    try {
      await reports.insert(report);
    } catch (error) {
      if (!(error instanceof DuplicateClientReportError)) throw error;
      return this.acknowledgeRace(command, photo);
    }
    await clustering.assign(report);
    await this.record('hazard-report.submitted', report, command);
    return { outcome: 'CREATED', report };
  }

  /** Two uploads of the same report raced (foreground and background sync): the first one won. */
  private async acknowledgeRace(
    command: SubmitReportCommand,
    orphan?: ReportPhoto,
  ): Promise<SubmitResult> {
    if (orphan) await this.deps.photos.remove(orphan);
    const winner = await this.deps.reports.findByClientReportId(
      command.reporterId,
      command.clientReportId,
    );
    return { outcome: 'ALREADY_RECEIVED', report: winner as HazardReport };
  }

  private assertNotFromTheFuture(capturedAt: Date): void {
    const latest = this.deps.clock.now().getTime() + this.deps.config.capturedAtSkewMs;
    if (capturedAt.getTime() > latest) {
      throw new ValidationError([{ field: 'capturedAt', code: 'CAPTURED_AT_IN_FUTURE' }]);
    }
  }

  private record(
    action: string,
    report: HazardReport,
    command: SubmitReportCommand,
  ): Promise<void> {
    return this.deps.audit.record({
      action,
      actorId: command.reporterId,
      actorRole: command.reporterRole,
      subjectType: 'HazardReport',
      subjectId: report.id,
      details: {
        clientReportId: command.clientReportId,
        syncedFromOffline: command.syncedFromOffline,
      },
      occurredAt: this.deps.clock.now(),
    });
  }
}

import { join, resolve } from 'node:path';
import { CentroidDistrictLocator } from '@shared/geo/districts';
import type { District } from '@shared/contracts/enums';
import type { ModuleContext, ModuleFactory, ModuleRegistration } from '@shared/module';
import { createHazardReportsRouter } from './api/hazard-reports.http';
import { createPhotoUpload } from './api/photoUpload';
import { ClusteringService } from './application/ClusteringService';
import type {
  DistrictResolver,
  HazardReportRepository,
  PhotoStorage,
  ReportClusterRepository,
} from './application/ports';
import { ReportReviewService } from './application/ReportReviewService';
import { ReportSubmissionService } from './application/ReportSubmissionService';
import { DEFAULT_CLUSTERING_CONFIG as config } from './domain/ClusteringConfig';
import { DuplicateDetector } from './domain/DuplicateDetector';
import { EscalationPolicy } from './domain/EscalationPolicy';
import { PhotoValidator } from './domain/PhotoValidator';
import { WeightedPriorityScorer } from './domain/PriorityScorer';
import { DiskPhotoStorage } from './infrastructure/DiskPhotoStorage';
import { MongoHazardReportRepository } from './infrastructure/MongoHazardReportRepository';
import { MongoReportClusterRepository } from './infrastructure/MongoReportClusterRepository';

/** Everything UC-3 needs from the outside world. Production uses MongoDB and disk; tests use fakes. */
export interface HazardReportsPorts {
  reports: HazardReportRepository;
  clusters: ReportClusterRepository;
  photos: PhotoStorage;
  districts: DistrictResolver;
  resolvePhoto(fileName: string): string | undefined;
}

/** `.data/` is git-ignored; `HAZARD_PHOTO_DIR` moves the photos somewhere else. */
const photoDirectory = (): string =>
  resolve(process.env.HAZARD_PHOTO_DIR ?? join(process.cwd(), '.data', 'hazard-photos'));

function productionPorts(): HazardReportsPorts {
  const photos = new DiskPhotoStorage(photoDirectory());
  const locator = new CentroidDistrictLocator();
  return {
    reports: new MongoHazardReportRepository(),
    clusters: new MongoReportClusterRepository(),
    photos,
    districts: { districtOf: (point) => locator.nearest(point, 1)[0] as District },
    resolvePhoto: (fileName) => photos.resolve(fileName),
  };
}

function buildServices(ctx: ModuleContext, ports: HazardReportsPorts) {
  const { reports, clusters, photos, districts } = ports;
  const clustering = new ClusteringService({
    reports,
    clusters,
    districts,
    config,
    clock: ctx.clock,
    ids: ctx.ids,
    scorer: new WeightedPriorityScorer(config),
    policy: new EscalationPolicy(config),
  });
  const submission = new ReportSubmissionService({
    reports,
    photos,
    clustering,
    config,
    clock: ctx.clock,
    ids: ctx.ids,
    audit: ctx.auditLog,
    detector: new DuplicateDetector(config),
    photoValidator: new PhotoValidator(config),
  });
  const review = new ReportReviewService({
    reports,
    clusters,
    clustering,
    events: ctx.eventBus,
    audit: ctx.auditLog,
    clock: ctx.clock,
  });
  return { submission, review };
}

/** UC-3 Submit and Verify Hazard Report: the one place concrete classes are built and joined. */
export function composeHazardReportsModule(
  ctx: ModuleContext,
  ports: HazardReportsPorts,
): ModuleRegistration {
  const api = {
    ...buildServices(ctx, ports),
    upload: createPhotoUpload(config.photoMaxBytes),
    resolvePhoto: ports.resolvePhoto,
  };
  return {
    name: 'hazard-reports',
    mountPath: '/api/hazard-reports',
    router: createHazardReportsRouter(api, ctx),
  };
}

export const createHazardReportsModule: ModuleFactory = (ctx) =>
  composeHazardReportsModule(ctx, productionPorts());

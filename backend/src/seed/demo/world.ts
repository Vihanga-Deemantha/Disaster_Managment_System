import { join, resolve } from 'node:path';
import { MongoAuditLog, type AuditLog } from '@shared/audit/AuditLog';
import type { AuthContext } from '@shared/auth';
import type { CitizenProfileReader } from '@shared/auth/application/CitizenProfileReader';
import type { User } from '@shared/auth/domain/types';
import type { District } from '@shared/contracts/enums';
import { InMemoryEventBus } from '@shared/events/EventBus';
import { CentroidDistrictLocator } from '@shared/geo/districts';
import { SequentialIdGenerator } from '@shared/ids/IdGenerator';
import type { SeedContext } from '@shared/module';
import { FixedClock } from '@shared/time/Clock';
import { AccessScope } from '../../modules/analytics/application/AccessScope';
import { AnalyticsController } from '../../modules/analytics/application/AnalyticsController';
import type { AnalyticsStore } from '../../modules/analytics/application/ports';
import { MongoAnalyticsStore } from '../../modules/analytics/infrastructure/AnalyticsStore';
import {
  AllocationDeployedHandler,
  WarningIssuedHandler,
} from '../../modules/analytics/infrastructure/EventHandlers';
import {
  CsvReportExporter,
  PdfReportExporter,
  PdfWriter,
  ReportExporterFactory,
  Sha256ChecksumCalculator,
} from '../../modules/analytics/infrastructure/ReportExporters';
import { ClusteringService } from '../../modules/hazard-reports/application/ClusteringService';
import { ReportReviewService } from '../../modules/hazard-reports/application/ReportReviewService';
import { ReportSubmissionService } from '../../modules/hazard-reports/application/ReportSubmissionService';
import { DEFAULT_CLUSTERING_CONFIG as config } from '../../modules/hazard-reports/domain/ClusteringConfig';
import { DuplicateDetector } from '../../modules/hazard-reports/domain/DuplicateDetector';
import { EscalationPolicy } from '../../modules/hazard-reports/domain/EscalationPolicy';
import { PhotoValidator } from '../../modules/hazard-reports/domain/PhotoValidator';
import { WeightedPriorityScorer } from '../../modules/hazard-reports/domain/PriorityScorer';
import { DiskPhotoStorage } from '../../modules/hazard-reports/infrastructure/DiskPhotoStorage';
import { MongoHazardReportRepository } from '../../modules/hazard-reports/infrastructure/MongoHazardReportRepository';
import { MongoReportClusterRepository } from '../../modules/hazard-reports/infrastructure/MongoReportClusterRepository';
import { AllocationService } from '../../modules/resources/application/AllocationService';
import type { ResourceStore, ResourceUnitOfWork } from '../../modules/resources/application/ports';
import { ResourceStatusService } from '../../modules/resources/application/ResourceStatusService';
import { MongoResourceStore } from '../../modules/resources/infrastructure/MongoResourceStore';
import { AlertDeliveryManager } from '../../modules/warnings/application/AlertDeliveryManager';
import { ChannelSelector } from '../../modules/warnings/application/ChannelSelector';
import { EscalationRequestHandler } from '../../modules/warnings/application/EscalationRequestHandler';
import { ReportApprovalHandler } from '../../modules/warnings/application/ReportApprovalHandler';
import { RetryPolicy } from '../../modules/warnings/application/RetryPolicy';
import { WarningController } from '../../modules/warnings/application/WarningController';
import { MongoAlertNotificationRepository } from '../../modules/warnings/infrastructure/MongoAlertNotificationRepository';
import { MongoCitizenDirectory } from '../../modules/warnings/infrastructure/MongoCitizenDirectory';
import { MongoWarningRepository } from '../../modules/warnings/infrastructure/MongoWarningRepository';
import { ScriptedGateways } from './gateways';

/** What the demo seed needs beyond the base seed: the registered-citizens port that alert targeting reads. */
export interface DemoSeedContext extends SeedContext {
  citizenProfiles: CitizenProfileReader;
}

/** A provisioned account, and the identity the application services expect from a signed-in person. */
export interface Actor {
  user: User;
  auth: AuthContext;
}

/** Everyone the scenarios act as. District officers are keyed by district; some accounts are optional extras. */
export interface Actors {
  dmc1: Actor;
  dmc2: Actor;
  duty1: Actor;
  duty2: Actor;
  ngo: Actor;
  forces: Actor;
  agency: Actor;
  donor: Actor;
  district: Partial<Record<District, Actor>>;
}

export const STAFF_EMAILS = {
  dmc1: 'dmc.officer@safezone.lk',
  dmc2: 'dmc.officer2@safezone.lk',
  duty1: 'duty.officer@safezone.lk',
  duty2: 'duty.officer2@safezone.lk',
  ngo: 'ngo.manager@safezone.lk',
  forces: 'forces.liaison@safezone.lk',
  agency: 'agency.officer@safezone.lk',
  donor: 'donor@safezone.lk',
} as const;

export const DISTRICT_OFFICER_EMAILS: Partial<Record<District, string>> = {
  GAMPAHA: 'district.gampaha@safezone.lk',
  COLOMBO: 'district.colombo@safezone.lk',
  RATNAPURA: 'district.ratnapura@safezone.lk',
  KALUTARA: 'district.kalutara@safezone.lk',
  KEGALLE: 'district.kegalle@safezone.lk',
};

const MINUTE_MS = 60_000;

/** `.data/` is git-ignored; `HAZARD_PHOTO_DIR` moves the photos somewhere else (same rule as UC-3 itself). */
export const photoDirectory = (): string =>
  resolve(process.env.HAZARD_PHOTO_DIR ?? join(process.cwd(), '.data', 'hazard-photos'));

function authOf(user: User, at: Date): AuthContext {
  return {
    userId: user.userId,
    role: user.role,
    sessionId: `seed-${user.userId}`,
    authenticatedAt: at,
    ...(user.district ? { district: user.district } : {}),
    ...(user.organizationId ? { organizationId: user.organizationId } : {}),
    ...(user.organizationType ? { organizationType: user.organizationType } : {}),
  };
}

async function actorFor(ctx: SeedContext, email: string, at: Date): Promise<Actor> {
  const user = await ctx.users.findByEmail(email);
  if (!user)
    throw new Error(`The demo seed needs the staff account ${email}. Run the base seed first.`);
  return { user, auth: authOf(user, at) };
}

async function loadActors(ctx: SeedContext, at: Date): Promise<Actors> {
  const [dmc1, dmc2, duty1, duty2, ngo, forces, agency, donor] = await Promise.all(
    Object.values(STAFF_EMAILS).map((email) => actorFor(ctx, email, at)),
  );
  const district: Actors['district'] = {};
  for (const [name, email] of Object.entries(DISTRICT_OFFICER_EMAILS) as [District, string][]) {
    district[name] = await actorFor(ctx, email, at);
  }
  return {
    dmc1: dmc1 as Actor,
    dmc2: dmc2 as Actor,
    duty1: duty1 as Actor,
    duty2: duty2 as Actor,
    ngo: ngo as Actor,
    forces: forces as Actor,
    agency: agency as Actor,
    donor: donor as Actor,
    district,
  };
}

/** The same classes the running API is built from, joined here once, so the history is made by the real rules. */
export interface DemoWorld {
  ctx: DemoSeedContext;
  /** Moves through the past while the history is made; it always ends at the moment the seed started. */
  clock: FixedClock;
  ids: SequentialIdGenerator;
  audit: AuditLog;
  gateways: ScriptedGateways;
  actors: Actors;
  warnings: {
    repository: MongoWarningRepository;
    notifications: MongoAlertNotificationRepository;
    controller: WarningController;
  };
  hazards: {
    reports: MongoHazardReportRepository;
    clusters: MongoReportClusterRepository;
    submission: ReportSubmissionService;
    review: ReportReviewService;
  };
  resources: {
    store: MongoResourceStore;
    allocations: AllocationService;
    status: ResourceStatusService;
  };
  analytics: { store: AnalyticsStore; controller: AnalyticsController };
  /** When the seed started: every "minutes ago" in the scenarios counts back from here. */
  startedAt: Date;
  /** Sets the clock to this many minutes before the seed started, and returns that moment. */
  travelTo(minutesAgo: number): Date;
}

function composeWarnings(
  ctx: DemoSeedContext,
  base: { clock: FixedClock; ids: SequentialIdGenerator; audit: AuditLog; bus: InMemoryEventBus },
  gateways: ScriptedGateways,
) {
  const retryPolicy = new RetryPolicy();
  const repository = new MongoWarningRepository();
  const notifications = new MongoAlertNotificationRepository();
  const controller = new WarningController({
    warnings: repository,
    notifications,
    directory: new MongoCitizenDirectory(ctx.citizenProfiles),
    delivery: new AlertDeliveryManager({
      services: gateways.services,
      retryPolicy,
      clock: base.clock,
    }),
    selector: new ChannelSelector(),
    events: base.bus,
    audit: base.audit,
    clock: base.clock,
    ids: base.ids,
    maxRetries: retryPolicy.maxRetries,
  });
  // The two UC-3 -> UC-1 hand-offs, exactly as the running API registers them.
  const deps = { warnings: repository, events: base.bus, audit: base.audit, clock: base.clock };
  new EscalationRequestHandler({ ...deps, ids: base.ids }).register();
  new ReportApprovalHandler(deps).register();
  return { repository, notifications, controller };
}

function composeHazards(base: {
  clock: FixedClock;
  ids: SequentialIdGenerator;
  audit: AuditLog;
  bus: InMemoryEventBus;
}) {
  const reports = new MongoHazardReportRepository();
  const clusters = new MongoReportClusterRepository();
  const locator = new CentroidDistrictLocator();
  const clustering = new ClusteringService({
    reports,
    clusters,
    districts: { districtOf: (point) => locator.nearest(point, 1)[0] as District },
    config,
    clock: base.clock,
    ids: base.ids,
    scorer: new WeightedPriorityScorer(config),
    policy: new EscalationPolicy(config),
  });
  const submission = new ReportSubmissionService({
    reports,
    photos: new DiskPhotoStorage(photoDirectory()),
    clustering,
    config,
    clock: base.clock,
    ids: base.ids,
    audit: base.audit,
    detector: new DuplicateDetector(config),
    photoValidator: new PhotoValidator(config),
  });
  const review = new ReportReviewService({
    reports,
    clusters,
    clustering,
    events: base.bus,
    audit: base.audit,
    clock: base.clock,
  });
  return { reports, clusters, submission, review };
}

function composeResources(base: {
  clock: FixedClock;
  ids: SequentialIdGenerator;
  bus: InMemoryEventBus;
}) {
  const store = new MongoResourceStore();
  // The seed writes one step at a time, so a plain store is enough: no transaction (and no replica set) needed.
  const uow: ResourceUnitOfWork = {
    run: <T>(work: (unit: ResourceStore) => Promise<T>) => work(store),
  };
  return {
    store,
    allocations: new AllocationService({ uow, clock: base.clock, ids: base.ids, events: base.bus }),
    status: new ResourceStatusService({ uow, clock: base.clock, ids: base.ids }),
  };
}

function composeAnalytics(base: {
  clock: FixedClock;
  ids: SequentialIdGenerator;
  audit: AuditLog;
  bus: InMemoryEventBus;
}) {
  const store = new MongoAnalyticsStore();
  const issued = new WarningIssuedHandler(store);
  const deployed = new AllocationDeployedHandler(store);
  base.bus.subscribe('WarningIssued', (event) => issued.handle(event));
  base.bus.subscribe('AllocationDeployed', (event) => deployed.handle(event));
  const controller = new AnalyticsController({
    store,
    scope: new AccessScope(base.audit, base.clock),
    clock: base.clock,
    ids: base.ids,
    audit: base.audit,
    checksum: new Sha256ChecksumCalculator(),
    exporters: new ReportExporterFactory(
      new PdfReportExporter(new PdfWriter()),
      new CsvReportExporter(),
    ),
  });
  return { store, controller };
}

export async function buildWorld(ctx: DemoSeedContext): Promise<DemoWorld> {
  const startedAt = ctx.clock.now();
  const clock = new FixedClock(startedAt);
  const ids = new SequentialIdGenerator('demo');
  const audit = new MongoAuditLog();
  // A failing subscriber must stop the seed: unlike the running API, which only logs it.
  const bus = new InMemoryEventBus((error, event) => {
    throw new Error(`A handler of ${event.type} failed: ${String(error)}`);
  });
  const base = { clock, ids, audit, bus };
  const gateways = new ScriptedGateways();
  return {
    ctx,
    clock,
    ids,
    audit,
    gateways,
    actors: await loadActors(ctx, startedAt),
    warnings: composeWarnings(ctx, base, gateways),
    hazards: composeHazards(base),
    resources: composeResources(base),
    analytics: composeAnalytics(base),
    startedAt,
    travelTo(minutesAgo) {
      const moment = new Date(startedAt.getTime() - minutesAgo * MINUTE_MS);
      clock.set(moment);
      return moment;
    },
  };
}

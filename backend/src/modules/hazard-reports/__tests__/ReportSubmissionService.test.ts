import { ConflictError, ValidationError } from '@shared/errors/DomainError';
import { SequentialIdGenerator } from '@shared/ids/IdGenerator';
import { FakeAuditLog } from '@shared/testing/FakeAuditLog';
import { FixedClock } from '@shared/time/Clock';
import { ClusteringService } from '../application/ClusteringService';
import { DuplicateClientReportError } from '../application/ports';
import {
  ReportSubmissionService,
  type SubmitReportCommand,
} from '../application/ReportSubmissionService';
import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { DuplicateDetector } from '../domain/DuplicateDetector';
import { EscalationPolicy } from '../domain/EscalationPolicy';
import type { HazardReport } from '../domain/HazardReport';
import { PhotoValidator } from '../domain/PhotoValidator';
import { WeightedPriorityScorer } from '../domain/PriorityScorer';
import { aReport, jpeg, KALUTARA, minutesAfter, north } from '../testing/builders';
import {
  FakePhotoStorage,
  fixedDistrict,
  InMemoryHazardReportRepository,
  InMemoryReportClusterRepository,
} from '../testing/inMemory';

/** The server clock when a test starts; reports are captured 10 minutes earlier. */
const NOW = minutesAfter(60);
const CAPTURED = minutesAfter(50);

function build(reports: InMemoryHazardReportRepository = new InMemoryHazardReportRepository()) {
  const clusters = new InMemoryReportClusterRepository();
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator('id');
  const photos = new FakePhotoStorage();
  const audit = new FakeAuditLog();
  const clustering = new ClusteringService({
    reports,
    clusters,
    districts: fixedDistrict('KALUTARA'),
    scorer: new WeightedPriorityScorer(config),
    policy: new EscalationPolicy(config),
    config,
    clock,
    ids,
  });
  const service = new ReportSubmissionService({
    reports,
    photos,
    clustering,
    detector: new DuplicateDetector(config),
    photoValidator: new PhotoValidator(config),
    config,
    clock,
    ids,
    audit,
  });
  return { service, reports, clusters, clock, photos, audit };
}

const command = (over: Partial<SubmitReportCommand> = {}): SubmitReportCommand => ({
  reporterId: 'citizen-1',
  reporterRole: 'CITIZEN',
  clientReportId: 'client-0001',
  hazardType: 'FLOOD',
  description: 'Water is rising',
  location: { ...KALUTARA, source: 'GPS' },
  capturedAt: CAPTURED,
  syncedFromOffline: false,
  ...over,
});

const secondFromSameSpot = (over: Partial<SubmitReportCommand> = {}) =>
  command({
    clientReportId: 'client-0002',
    description: 'Now knee deep',
    location: { ...north(KALUTARA, 50), source: 'GPS' },
    capturedAt: NOW,
    ...over,
  });

describe('ReportSubmissionService.submit: main flow', () => {
  it("UC-3 step 7: stores a Pending report with the client's capturedAt and the server's receivedAt", async () => {
    const { service, audit } = build();
    const { outcome, report } = await service.submit(command());
    expect(outcome).toBe('CREATED');
    expect(report.snapshot()).toMatchObject({
      id: 'id-1',
      status: 'PENDING',
      capturedAt: CAPTURED,
      receivedAt: NOW,
      syncedFromOffline: false,
      clusterId: 'id-2',
    });
    expect(audit.actions()).toEqual(['hazard-report.submitted']);
  });

  it('UC-3 steps 8–10: the report joins the cluster that is created for it', async () => {
    const { service, clusters } = build();
    await service.submit(command());
    expect((await clusters.findById('id-2'))?.snapshot()).toMatchObject({
      reportIds: ['id-1'],
      counts: { total: 1, pending: 1, verified: 0, rejected: 0 },
    });
  });

  it("a volunteer's report is typed VOLUNTEER", async () => {
    const { service } = build();
    const { report } = await service.submit(command({ reporterRole: 'COMMUNITY_VOLUNTEER' }));
    expect(report.snapshot().reporterType).toBe('VOLUNTEER');
  });

  it('UC-3 E1: a manual location keeps source MANUAL', async () => {
    const { service } = build();
    const { report } = await service.submit(
      command({ location: { ...KALUTARA, source: 'MANUAL' } }),
    );
    expect(report.location.source).toBe('MANUAL');
  });

  it('a submission without a photo is allowed and stores none', async () => {
    const { service, photos } = build();
    const { report } = await service.submit(command());
    expect(report.snapshot().photo).toBeUndefined();
    expect(photos.saved).toEqual([]);
  });

  it('stores the photo under the report id and links its url', async () => {
    const { service, photos } = build();
    const { report } = await service.submit(command({ photo: jpeg() }));
    expect(photos.saved.map((saved) => saved.key)).toEqual(['id-1']);
    expect(report.snapshot().photo).toMatchObject({
      url: '/api/hazard-reports/photos/id-1.jpg',
      bytes: 16,
    });
  });
});

describe('ReportSubmissionService.submit: validation', () => {
  it('UC-3 E2: an invalid photo is refused and nothing is saved', async () => {
    const { service, reports, photos } = build();
    const gif = { content: new Uint8Array(64), mimeType: 'image/gif' };
    await expect(service.submit(command({ photo: gif }))).rejects.toMatchObject({
      code: 'INVALID_PHOTO',
    });
    expect(await reports.findByReporter('citizen-1')).toEqual([]);
    expect(photos.saved).toEqual([]);
  });

  it('edge: a capture time exactly 5 minutes ahead of the server is accepted', async () => {
    const { service } = build();
    const result = await service.submit(
      command({ capturedAt: new Date(NOW.getTime() + 5 * 60_000) }),
    );
    expect(result.outcome).toBe('CREATED');
  });

  it('edge: a capture time more than 5 minutes ahead of the server is refused', async () => {
    const { service, reports } = build();
    const future = command({ capturedAt: new Date(NOW.getTime() + 5 * 60_000 + 1) });
    const attempt = service.submit(future);
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      fields: [{ field: 'capturedAt', code: 'CAPTURED_AT_IN_FUTURE' }],
    });
    expect(await reports.findByReporter('citizen-1')).toEqual([]);
  });
});

describe('ReportSubmissionService.submit: replays (H7)', () => {
  it('UC-3 A1/H7: the same clientReportId twice yields one report and an unchanged cluster', async () => {
    const { service, reports, clusters } = build();
    const first = await service.submit(command());
    const second = await service.submit(command());
    expect(second.outcome).toBe('ALREADY_RECEIVED');
    expect(second.report.id).toBe(first.report.id);
    expect(await reports.findByReporter('citizen-1')).toHaveLength(1);
    expect((await clusters.findById('id-2'))?.snapshot().counts.total).toBe(1);
  });

  it('H7: a different reporter may reuse the same clientReportId', async () => {
    const { service } = build();
    await service.submit(command());
    const other = await service.submit(command({ reporterId: 'citizen-2' }));
    expect(other.outcome).toBe('CREATED');
  });

  /** Repository whose first lookup misses and whose insert loses a race against another upload. */
  class RacingRepository extends InMemoryHazardReportRepository {
    private looked = false;

    constructor(private readonly winner: HazardReport) {
      super();
    }

    override async findByClientReportId(reporterId: string, clientReportId: string) {
      if (!this.looked) {
        this.looked = true;
        return undefined;
      }
      return super.findByClientReportId(reporterId, clientReportId);
    }

    override async insert(): Promise<void> {
      await this.save(this.winner);
      throw new DuplicateClientReportError();
    }
  }

  it('H7: a lost insert race is acknowledged and its photo removed', async () => {
    const winner = aReport({ id: 'winner' });
    const { service, photos } = build(new RacingRepository(winner));
    const result = await service.submit(command({ photo: jpeg() }));
    expect(result.outcome).toBe('ALREADY_RECEIVED');
    expect(result.report.id).toBe('winner');
    expect(photos.removed).toHaveLength(1);
  });

  it('H7: a lost race without a photo removes nothing', async () => {
    const { service, photos } = build(new RacingRepository(aReport({ id: 'winner' })));
    const result = await service.submit(command());
    expect(result.outcome).toBe('ALREADY_RECEIVED');
    expect(photos.removed).toEqual([]);
  });

  it('an unexpected insert failure propagates', async () => {
    class BrokenRepository extends InMemoryHazardReportRepository {
      override async insert(): Promise<void> {
        throw new Error('db down');
      }
    }
    const { service } = build(new BrokenRepository());
    await expect(service.submit(command())).rejects.toThrow('db down');
  });
});

describe('ReportSubmissionService.submit: duplicates (E3)', () => {
  it('UC-3 E3: an online duplicate with no choice asks the reporter', async () => {
    const { service, reports } = build();
    await service.submit(command());
    const attempt = service.submit(secondFromSameSpot());
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({
      code: 'DUPLICATE_SUSPECTED',
      details: { existingReportId: 'id-1' },
    });
    expect(await reports.findByReporter('citizen-1')).toHaveLength(1);
  });

  it('UC-3 E3: UPDATE amends the existing report and creates none', async () => {
    const { service, reports, audit } = build();
    await service.submit(command());
    const result = await service.submit(secondFromSameSpot({ duplicateAction: 'UPDATE' }));
    expect(result.outcome).toBe('UPDATED_EXISTING');
    expect(result.report.id).toBe('id-1');
    expect(result.report.snapshot().description).toBe('Now knee deep');
    expect(await reports.findByReporter('citizen-1')).toHaveLength(1);
    expect(audit.actions()).toEqual(['hazard-report.submitted', 'hazard-report.updated']);
  });

  it('UC-3 E3: UPDATE with a new photo replaces the old one without overwriting its file', async () => {
    const { service, photos } = build();
    const first = await service.submit(command({ photo: jpeg() }));
    const oldUrl = first.report.snapshot().photo?.url;
    const updated = await service.submit(
      secondFromSameSpot({ duplicateAction: 'UPDATE', photo: jpeg(32) }),
    );
    expect(updated.report.snapshot().photo?.url).not.toBe(oldUrl);
    expect(photos.saved).toHaveLength(2);
  });

  it('UC-3 E3: NEW creates a second report in the same cluster', async () => {
    const { service, reports, clusters } = build();
    await service.submit(command());
    const result = await service.submit(secondFromSameSpot({ duplicateAction: 'NEW' }));
    expect(result.outcome).toBe('CREATED');
    expect(await reports.findByReporter('citizen-1')).toHaveLength(2);
    expect((await clusters.findById('id-2'))?.snapshot().counts.total).toBe(2);
  });

  it('UC-3 E3/H6: a duplicate synced from offline is merged automatically and keeps the earliest capture time', async () => {
    const { service, reports } = build();
    await service.submit(command());
    const earlier = secondFromSameSpot({ syncedFromOffline: true, capturedAt: minutesAfter(40) });
    const result = await service.submit(earlier);
    expect(result.outcome).toBe('UPDATED_EXISTING');
    expect(result.report.capturedAt).toEqual(minutesAfter(40));
    expect(await reports.findByReporter('citizen-1')).toHaveLength(1);
  });

  it('a reviewed earlier report is not a duplicate target', async () => {
    const { service, reports } = build();
    const first = await service.submit(command());
    first.report.verify('usr-duty-1', NOW);
    await reports.save(first.report);
    const result = await service.submit(secondFromSameSpot());
    expect(result.outcome).toBe('CREATED');
  });

  it('a report from further than 200 m is not a duplicate', async () => {
    const { service } = build();
    await service.submit(command());
    const far = secondFromSameSpot({ location: { ...north(KALUTARA, 400), source: 'GPS' } });
    expect((await service.submit(far)).outcome).toBe('CREATED');
  });
});

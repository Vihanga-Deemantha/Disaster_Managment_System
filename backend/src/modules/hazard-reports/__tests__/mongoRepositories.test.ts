import { clearDatabase, connectTestMongo } from '@shared/testing/mongo';
import { DuplicateClientReportError } from '../application/ports';
import { HazardReportModel, ReportClusterModel } from '../infrastructure/models';
import { MongoHazardReportRepository } from '../infrastructure/MongoHazardReportRepository';
import { MongoReportClusterRepository } from '../infrastructure/MongoReportClusterRepository';
import { aCluster, aReport, KALUTARA, minutesAfter, north } from '../testing/builders';

let teardown: () => Promise<void>;
const reports = new MongoHazardReportRepository();
const clusters = new MongoReportClusterRepository();

beforeAll(async () => {
  teardown = await connectTestMongo();
  await Promise.all([HazardReportModel.init(), ReportClusterModel.init()]);
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());

describe('MongoHazardReportRepository', () => {
  it('round-trips a minimal report', async () => {
    const report = aReport();
    await reports.insert(report);
    expect((await reports.findById('r-1'))?.snapshot()).toEqual(report.snapshot());
  });

  it('round-trips a report with every optional field set', async () => {
    const full = aReport({
      photo: { url: '/api/hazard-reports/photos/r-1.jpg', mime: 'image/jpeg', bytes: 2048 },
      location: { ...KALUTARA, source: 'GPS', accuracyM: 12 },
      syncedFromOffline: true,
      status: 'REJECTED',
      reviewedBy: 'usr-duty-1',
      reviewedAt: minutesAfter(20),
      rejectionReason: 'Photo shows another place',
      clusterId: 'cluster-1',
    });
    await reports.insert(full);
    expect((await reports.findById('r-1'))?.snapshot()).toEqual(full.snapshot());
  });

  it('keeps an empty description and does not store missing fields as null', async () => {
    await reports.insert(aReport({ description: '' }));
    const stored = await HazardReportModel.collection.findOne({ _id: 'r-1' as never });
    expect(stored).toMatchObject({ description: '' });
    expect(stored).not.toHaveProperty('photo');
    expect(stored).not.toHaveProperty('clusterId');
    expect(stored?.location).not.toHaveProperty('accuracyM');
  });

  it('findById answers undefined for an unknown report', async () => {
    expect(await reports.findById('nope')).toBeUndefined();
  });

  it('H7: a second insert with the same reporter and clientReportId is a replay', async () => {
    await reports.insert(aReport());
    await expect(reports.insert(aReport({ id: 'r-2' }))).rejects.toBeInstanceOf(
      DuplicateClientReportError,
    );
  });

  it('H7: another reporter may reuse the same clientReportId', async () => {
    await reports.insert(aReport());
    await reports.insert(aReport({ id: 'r-2', reporterId: 'citizen-2' }));
    expect(await reports.findById('r-2')).toBeDefined();
  });

  it('a collision on anything other than clientReportId is a real fault, not a replay', async () => {
    await reports.insert(aReport());
    const clash = reports.insert(aReport({ id: 'r-1', clientReportId: 'client-0002' }));
    await expect(clash).rejects.toMatchObject({ code: 11000 });
    await expect(clash).rejects.not.toBeInstanceOf(DuplicateClientReportError);
  });

  it('an invalid document is rejected without being mistaken for a replay', async () => {
    const broken = aReport({ id: 'r-9', clientReportId: 'client-0009' });
    jest.spyOn(HazardReportModel, 'create').mockRejectedValueOnce(new Error('boom') as never);
    await expect(reports.insert(broken)).rejects.toThrow('boom');
  });

  it('save inserts a new report and overwrites an existing one', async () => {
    const report = aReport();
    await reports.save(report);
    report.verify('usr-duty-1', minutesAfter(5));
    await reports.save(report);
    expect((await reports.findById('r-1'))?.snapshot()).toMatchObject({
      status: 'VERIFIED',
      reviewedBy: 'usr-duty-1',
    });
    expect(await HazardReportModel.countDocuments()).toBe(1);
  });

  it('findByClientReportId finds a report for its reporter only', async () => {
    await reports.insert(aReport());
    expect((await reports.findByClientReportId('citizen-1', 'client-0001'))?.id).toBe('r-1');
    expect(await reports.findByClientReportId('citizen-2', 'client-0001')).toBeUndefined();
    expect(await reports.findByClientReportId('citizen-1', 'client-9999')).toBeUndefined();
  });

  it('findByReporter returns only that reporter’s reports, newest capture first', async () => {
    await reports.insert(
      aReport({ id: 'old', clientReportId: 'c-1', capturedAt: minutesAfter(0) }),
    );
    await reports.insert(
      aReport({ id: 'new', clientReportId: 'c-2', capturedAt: minutesAfter(30) }),
    );
    await reports.insert(aReport({ id: 'other', clientReportId: 'c-3', reporterId: 'citizen-2' }));
    expect((await reports.findByReporter('citizen-1')).map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('findByCluster returns the cluster’s reports, oldest capture first', async () => {
    await reports.insert(
      aReport({ id: 'b', clientReportId: 'c-1', clusterId: 'c1', capturedAt: minutesAfter(9) }),
    );
    await reports.insert(
      aReport({ id: 'a', clientReportId: 'c-2', clusterId: 'c1', capturedAt: minutesAfter(1) }),
    );
    await reports.insert(aReport({ id: 'x', clientReportId: 'c-3', clusterId: 'c2' }));
    expect((await reports.findByCluster('c1')).map((r) => r.id)).toEqual(['a', 'b']);
  });

  describe('search', () => {
    beforeEach(async () => {
      await reports.insert(
        aReport({
          id: 'a',
          clientReportId: 'c-1',
          description: 'Bridge is flooded',
          receivedAt: minutesAfter(1),
        }),
      );
      await reports.insert(
        aReport({
          id: 'b',
          clientReportId: 'c-2',
          description: 'Landslide near a.*( school',
          status: 'REJECTED',
          receivedAt: minutesAfter(2),
        }),
      );
      await reports.insert(
        aReport({
          id: 'c',
          clientReportId: 'c-3',
          description: 'Road blocked',
          status: 'VERIFIED',
          receivedAt: minutesAfter(3),
        }),
      );
    });

    it('with no filter returns everything, newest arrival first', async () => {
      expect((await reports.search({})).map((r) => r.id)).toEqual(['c', 'b', 'a']);
    });

    it('filters by status', async () => {
      expect((await reports.search({ status: 'REJECTED' })).map((r) => r.id)).toEqual(['b']);
    });

    it('matches text case-insensitively', async () => {
      expect((await reports.search({ text: 'BRIDGE' })).map((r) => r.id)).toEqual(['a']);
    });

    it('treats regular-expression characters in the text literally', async () => {
      expect((await reports.search({ text: 'a.*(' })).map((r) => r.id)).toEqual(['b']);
      expect(await reports.search({ text: '.*' })).toHaveLength(1);
    });

    it('combines status and text', async () => {
      expect(await reports.search({ status: 'VERIFIED', text: 'bridge' })).toEqual([]);
    });

    it('returns at most 200 reports', async () => {
      await HazardReportModel.insertMany(
        Array.from({ length: 205 }, (_, index) => ({
          ...aReport({ id: `bulk-${index}`, clientReportId: `bulk-${index}` }).snapshot(),
          _id: `bulk-${index}`,
        })),
      );
      expect(await reports.search({})).toHaveLength(200);
    });
  });
});

describe('MongoReportClusterRepository', () => {
  it('round-trips a cluster without escalation details', async () => {
    const cluster = aCluster();
    await clusters.save(cluster);
    expect((await clusters.findById('cluster-1'))?.snapshot()).toEqual(cluster.snapshot());
  });

  it('round-trips an escalated cluster', async () => {
    const cluster = aCluster({
      status: 'ESCALATED',
      escalatedBy: 'usr-duty-1',
      escalatedAt: minutesAfter(40),
      reportIds: ['r-1', 'r-2'],
      priorityScore: 92,
      band: 'HIGH',
      counts: { total: 2, pending: 0, verified: 2, rejected: 0 },
    });
    await clusters.save(cluster);
    expect((await clusters.findById('cluster-1'))?.snapshot()).toEqual(cluster.snapshot());
  });

  it('save overwrites the stored cluster', async () => {
    await clusters.save(aCluster());
    await clusters.save(aCluster({ status: 'CLOSED' }));
    expect((await clusters.findById('cluster-1'))?.status).toBe('CLOSED');
    expect(await ReportClusterModel.countDocuments()).toBe(1);
  });

  it('findById answers undefined for an unknown cluster', async () => {
    expect(await clusters.findById('nope')).toBeUndefined();
  });

  describe('findOpenNear', () => {
    it('returns open and escalation-recommended clusters inside the box, nothing else', async () => {
      await clusters.save(aCluster({ id: 'open' }));
      await clusters.save(aCluster({ id: 'recommended', status: 'ESCALATION_RECOMMENDED' }));
      await clusters.save(aCluster({ id: 'closed', status: 'CLOSED' }));
      await clusters.save(aCluster({ id: 'escalated', status: 'ESCALATED' }));
      const found = await clusters.findOpenNear(KALUTARA, 2);
      expect(found.map((c) => c.id).sort()).toEqual(['open', 'recommended']);
    });

    it('includes a cluster just inside the radius and excludes ones far away', async () => {
      await clusters.save(aCluster({ id: 'edge', centroid: north(KALUTARA, 1900) }));
      await clusters.save(aCluster({ id: 'far-north', centroid: north(KALUTARA, 50_000) }));
      await clusters.save(
        aCluster({ id: 'far-east', centroid: { ...KALUTARA, lng: KALUTARA.lng + 0.1 } }),
      );
      const found = await clusters.findOpenNear(KALUTARA, 2);
      expect(found.map((c) => c.id)).toEqual(['edge']);
    });

    it('includes a cluster a short way east or west', async () => {
      await clusters.save(
        aCluster({ id: 'east', centroid: { ...KALUTARA, lng: KALUTARA.lng + 0.01 } }),
      );
      await clusters.save(
        aCluster({ id: 'west', centroid: { ...KALUTARA, lng: KALUTARA.lng - 0.01 } }),
      );
      const found = await clusters.findOpenNear(KALUTARA, 2);
      expect(found.map((c) => c.id).sort()).toEqual(['east', 'west']);
    });
  });

  it('findByStatus returns clusters in any of the given statuses', async () => {
    await clusters.save(aCluster({ id: 'a', status: 'OPEN' }));
    await clusters.save(aCluster({ id: 'b', status: 'ESCALATED' }));
    await clusters.save(aCluster({ id: 'c', status: 'CLOSED' }));
    const found = await clusters.findByStatus(['OPEN', 'CLOSED']);
    expect(found.map((cluster) => cluster.id).sort()).toEqual(['a', 'c']);
    expect(await clusters.findByStatus([])).toEqual([]);
  });
});

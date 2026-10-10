import { connectTestMongo, clearDatabase } from '@shared/testing/mongo';
import { MongoAnalyticsStore } from '../infrastructure/AnalyticsStore';
import { AnalyticsFilter } from '../domain/AnalyticsFilter';
import { event, input, alert, occupancy, dispatch } from '../testing/fixtures';
import { seedAnalyticsStore } from '../seed';
describe('UC-4 projection repositories', () => {
  let stop: () => Promise<void>;
  beforeAll(async () => {
    stop = await connectTestMongo();
  });
  afterAll(async () => {
    await stop?.();
  });
  beforeEach(clearDatabase);
  it('UC-4 CD-10: round trips own projections, applies inclusive filters and relief scope', async () => {
    const store = new MongoAnalyticsStore();
    await store.putEvent(event);
    await store.putEvent({ ...event, name: 'Updated' });
    await store.putAlert(alert);
    await store.putAlert(alert);
    await store.putAlert({ ...alert, id: 'outside', district: 'COLOMBO' });
    await store.putOccupancy(occupancy);
    await store.putOccupancy(occupancy);
    await store.putOccupancy({ ...occupancy, id: 'outside', at: '2026-08-01' });
    await store.putDispatch(dispatch);
    await store.putDispatch(dispatch);
    await store.putDispatch({ ...dispatch, id: 'other', organizationId: 'army' });
    await store.putDispatch({ ...dispatch, id: 'outside', at: '2026-10-01' });
    const filter = AnalyticsFilter.create(
      { ...input, district: 'RATNAPURA', organizationId: 'red-cross' },
      [event],
      new Date('2026-10-07'),
    );
    expect((await store.list())[0]?.name).toBe('Updated');
    expect(await store.countReach(filter)).toEqual([alert]);
    expect(await store.occupancySeries(filter)).toEqual([occupancy]);
    expect(await store.distributionByDistrict(filter)).toEqual([dispatch]);
    expect(
      await store.distributionByDistrict(
        AnalyticsFilter.create(input, [event], new Date('2026-10-07')),
      ),
    ).toHaveLength(2);
    await store.saveReport({
      reportId: 'r1',
      filter: input,
      options: { format: 'CSV', audience: 'EXTERNAL', datasets: ['alerts'] },
      generatedBy: 'ngo',
      generatedAt: '2026-10-01',
      status: 'COMPLETED',
      attempts: 1,
      checksum: 'hash',
    });
    await store.saveReport({
      reportId: 'r2',
      filter: input,
      options: { format: 'PDF', audience: 'INTERNAL', datasets: ['occupancy'] },
      generatedBy: 'dmc',
      generatedAt: '2026-10-02',
      status: 'FAILED',
      attempts: 2,
    });
    expect((await store.reports()).map((r) => r.reportId)).toEqual(['r2', 'r1']);
    expect((await store.reports('ngo')).map((r) => r.reportId)).toEqual(['r1']);
    expect(await store.reports('other')).toEqual([]);
  });
  it('UC-4 seed: six months, ten districts, real demo organisation IDs and empty Jaffna', async () => {
    const store = new MongoAnalyticsStore();
    await seedAnalyticsStore(store, new Date('2026-10-07T09:00:00Z'));
    expect(await store.list()).toHaveLength(60);
    const filter = AnalyticsFilter.create(
      {
        district: 'ALL',
        hazardType: 'ALL',
        from: '2026-10-01',
        to: '2026-10-07',
        organizationId: 'org-red-cross',
      },
      [],
      new Date('2026-10-07'),
    );
    const allocations = await store.distributionByDistrict(filter);
    expect(allocations).toHaveLength(70);
    expect(allocations.every((row) => row.organizationId === 'org-red-cross')).toBe(true);
    expect(new Set(allocations.map((row) => row.district)).size).toBe(10);
    expect(await store.countReach(filter)).toHaveLength(70);
    expect(
      await store.distributionByDistrict(
        AnalyticsFilter.create({ ...filter.value, district: 'JAFFNA' }, [], new Date('2026-10-07')),
      ),
    ).toEqual([]);
  });
});

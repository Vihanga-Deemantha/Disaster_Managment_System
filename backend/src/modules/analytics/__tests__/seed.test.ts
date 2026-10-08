import { seedAnalyticsStore, DISTRICT_PROFILES, ORGANIZATIONS } from '../seed';
import { MemoryAnalyticsStore } from '../testing/MemoryAnalyticsStore';

describe('Regional analytics demonstration seed', () => {
  it('populates ten districts with varied allocations, valid occupancy and repeatable IDs', async () => {
    const store = new MemoryAnalyticsStore();
    const now = new Date('2026-10-08T12:00:00Z');
    await seedAnalyticsStore(store, now);
    expect(store.events.size).toBe(60);
    expect(new Set([...store.dispatches.values()].map((row) => row.district)).size).toBe(10);
    for (const profile of DISTRICT_PROFILES) {
      const rows = [...store.dispatches.values()].filter(
        (row) => row.district === profile.district,
      );
      expect(new Set(rows.map((row) => row.organizationId)).size).toBe(ORGANIZATIONS.length);
      expect(new Set(rows.map((row) => row.quantity)).size).toBeGreaterThan(12);
    }
    for (const row of store.occupancy.values())
      expect(row.occupancy).toBeLessThanOrEqual(row.capacity);
    for (const row of store.alerts.values()) {
      expect(row.reached).toBeLessThanOrEqual(row.targeted);
      expect(row.reached + row.pendingRetry + row.failed).toBe(row.targeted);
    }
    const count = store.dispatches.size;
    await seedAnalyticsStore(store, now);
    expect(store.dispatches.size).toBe(count);
  });
});

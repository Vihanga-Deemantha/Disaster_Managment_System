import type { SeedFunction } from '@shared/module';
import type { AnalyticsStore } from '../application/ports';
import { MongoAnalyticsStore } from '../infrastructure/AnalyticsStore';
import type { CatalogEvent } from '../domain/types';

export const ORGANIZATIONS = [
  { id: 'dmc-central', name: 'DMC Central Fleet', category: 'Dry rations & water', unit: 'packs' },
  {
    id: 'org-red-cross',
    name: 'Red Cross Sri Lanka',
    category: 'Emergency medical kits',
    unit: 'kits',
  },
  { id: 'org-sl-army', name: 'Sri Lanka Army', category: 'Purified water packets', unit: 'packs' },
  { id: 'sarvodaya', name: 'Sarvodaya', category: 'Family hygiene kits', unit: 'kits' },
  {
    id: 'org-relief-foundation',
    name: 'Relief Foundation',
    category: 'Family hygiene kits',
    unit: 'kits',
  },
];
/** Six relative months; occupancy is demonstration history (no event contract exists). */
export async function seedAnalyticsStore(store: AnalyticsStore, now: Date): Promise<void> {
  for (let month = 0; month < 6; month++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - month, 1));
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const end = last > now ? now : last;
    for (const district of ['RATNAPURA', 'KALUTARA'] as const) {
      const event: CatalogEvent = {
        eventId: `${district.toLowerCase()}-${start.toISOString().slice(0, 7)}`,
        name: district === 'RATNAPURA' ? 'Ratnapura Monsoon Flood' : 'Kalutara Landslide',
        districts: [district],
        hazardType: district === 'RATNAPURA' ? 'FLOOD' : 'LANDSLIDE',
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
      await store.putEvent(event);
      for (let day = 1; day <= Math.min(12, end.getUTCDate()); day++) {
        const at = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day, 8),
        ).toISOString();
        const base = { eventId: event.eventId, district, hazardType: event.hazardType, at };
        const targeted = 1200 + day * 90;
        const reached = Math.round(targeted * (0.72 + day * 0.017));
        const channel = { sent: targeted, delivered: reached, failed: targeted - reached };
        await store.putAlert({
          ...base,
          id: `${event.eventId}-alert-${day}`,
          targeted,
          reached,
          pendingRetry: Math.floor((targeted - reached) / 2),
          failed: Math.ceil((targeted - reached) / 2),
          byChannel: {
            PUSH: channel,
            SMS: channel,
            EMAIL: { sent: 0, delivered: 0, failed: 0 },
            WHATSAPP: { sent: 0, delivered: 0, failed: 0 },
          },
          officerName: 'Demo DMC Officer',
          citizenIdentifiers: ['synthetic-recipient'],
        });
        for (let shelter = 1; shelter <= 2; shelter++)
          await store.putOccupancy({
            ...base,
            id: `${event.eventId}-shelter-${shelter}-${day}`,
            shelterId: `${district}-shelter-${shelter}`,
            shelterName: `${district} Community Shelter ${shelter}`,
            occupancy: 100 + ((day * 43 + shelter * 20) % 300),
            capacity: 450,
          });
        for (const org of ORGANIZATIONS)
          await store.putDispatch({
            ...base,
            id: `${event.eventId}-${org.id}-${day}`,
            organizationId: org.id,
            organizationName: org.name,
            supplyCategory: org.category,
            quantity: 100 + day * 25,
            unit: org.unit,
            officerName: 'Demo District Officer',
          });
      }
    }
  }
}

/** UC-4 demo data: past events, relief distributions and report templates. */
export const seedAnalytics: SeedFunction = async (ctx) => {
  await seedAnalyticsStore(new MongoAnalyticsStore(), ctx.clock.now());
  ctx.logger.info('UC-4 analytics projections seeded.');
};

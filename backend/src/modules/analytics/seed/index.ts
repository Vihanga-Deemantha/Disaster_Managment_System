import type { SeedFunction } from '@shared/module';
import type { AnalyticsStore } from '../application/ports';
import { MongoAnalyticsStore } from '../infrastructure/AnalyticsStore';
import type { District, HazardType } from '@shared/contracts/enums';
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
/** Regional profiles keep demo data deterministic and comparable across seed runs. */
export const DISTRICT_PROFILES: readonly {
  district: District;
  name: string;
  hazardType: HazardType;
  demand: number;
}[] = [
  { district: 'RATNAPURA', name: 'Ratnapura Monsoon Flood', hazardType: 'FLOOD', demand: 1.45 },
  { district: 'KALUTARA', name: 'Kalutara Landslide', hazardType: 'LANDSLIDE', demand: 1.2 },
  { district: 'COLOMBO', name: 'Colombo Urban Flood', hazardType: 'FLOOD', demand: 1.65 },
  { district: 'GAMPAHA', name: 'Gampaha River Flood', hazardType: 'FLOOD', demand: 1.35 },
  { district: 'GALLE', name: 'Galle Coastal Flood', hazardType: 'FLOOD', demand: 0.95 },
  { district: 'MATARA', name: 'Matara Monsoon Flood', hazardType: 'FLOOD', demand: 1.1 },
  {
    district: 'KEGALLE',
    name: 'Kegalle Hillside Landslide',
    hazardType: 'LANDSLIDE',
    demand: 0.85,
  },
  { district: 'KANDY', name: 'Kandy Hillside Landslide', hazardType: 'LANDSLIDE', demand: 1.05 },
  { district: 'BADULLA', name: 'Badulla Landslide', hazardType: 'LANDSLIDE', demand: 0.75 },
  {
    district: 'NUWARA_ELIYA',
    name: 'Nuwara Eliya Landslide',
    hazardType: 'LANDSLIDE',
    demand: 0.65,
  },
];
/** Six relative months; occupancy is demonstration history (no event contract exists). */
export async function seedAnalyticsStore(store: AnalyticsStore, now: Date): Promise<void> {
  for (let month = 0; month < 6; month++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - month, 1));
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const end = last > now ? now : last;
    for (const [region, profile] of DISTRICT_PROFILES.entries()) {
      const { district } = profile;
      const event: CatalogEvent = {
        eventId: `${district.toLowerCase()}-${start.toISOString().slice(0, 7)}`,
        name: profile.name,
        districts: [district],
        hazardType: profile.hazardType,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
      await store.putEvent(event);
      for (let day = 1; day <= Math.min(12, end.getUTCDate()); day++) {
        const at = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day, 8),
        ).toISOString();
        const base = { eventId: event.eventId, district, hazardType: event.hazardType, at };
        const targeted = Math.round((1200 + day * 90) * profile.demand);
        const reached = Math.round(
          targeted * Math.min(0.97, 0.68 + day * 0.017 + (region % 4) * 0.025),
        );
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
            occupancy: Math.round(
              (90 + ((day * 43 + shelter * 20 + region * 37) % 260)) * profile.demand,
            ),
            capacity: Math.round(450 * profile.demand),
          });
        for (const [partner, org] of ORGANIZATIONS.entries())
          await store.putDispatch({
            ...base,
            id: `${event.eventId}-${org.id}-${day}`,
            organizationId: org.id,
            organizationName: org.name,
            supplyCategory: org.category,
            quantity: Math.round(
              (80 + day * 22) *
                profile.demand *
                (0.65 + ((region * 3 + partner * 5 + month) % 9) * 0.12) *
                (1 + ((day + partner + region) % 4) * 0.08),
            ),
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

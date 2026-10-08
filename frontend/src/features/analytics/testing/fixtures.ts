import type { CatalogEvent, Dashboard } from '../types';
export const event: CatalogEvent = {
  eventId: 'flood',
  name: 'Ratnapura Monsoon Flood',
  hazardType: 'FLOOD',
  districts: ['RATNAPURA'],
  startDate: '2026-09-01',
  endDate: '2026-09-30',
};
export const dashboard: Dashboard = {
  filter: {
    eventId: 'flood',
    district: 'ALL',
    hazardType: 'ALL',
    from: '2026-09-01',
    to: '2026-09-30',
  },
  generatedAt: '2026-10-07T09:00:00Z',
  metrics: {
    totals: {
      alertsIssued: 2,
      reachPct: 80,
      peakOccupancy: 90,
      reliefDistributed: [
        { unit: 'kits', quantity: 100 },
        { unit: 'packs', quantity: 200 },
      ],
    },
    recordCount: 4,
    alertTimeline: [{ date: '2026-09-02', alerts: 2, targeted: 100, reached: 80, reachPct: 80 }],
    occupancySeries: [{ date: '2026-09-02', occupancy: 90, capacity: 100 }],
    distributionByDistrict: [
      {
        district: 'RATNAPURA',
        organizationId: 'red-cross',
        organizationName: 'Red Cross Sri Lanka',
        unit: 'kits',
        quantity: 100,
      },
      {
        district: 'RATNAPURA',
        organizationId: 'army',
        organizationName: 'Sri Lanka Army',
        unit: 'packs',
        quantity: 200,
      },
    ],
    distributionByOrganisation: [
      {
        organizationId: 'red-cross',
        organizationName: 'Red Cross Sri Lanka',
        unit: 'kits',
        quantity: 100,
        sharePct: 100,
      },
      {
        organizationId: 'army',
        organizationName: 'Sri Lanka Army',
        unit: 'packs',
        quantity: 200,
        sharePct: 100,
      },
    ],
    allocations: [
      {
        id: 'd1',
        at: '2026-09-02',
        district: 'RATNAPURA',
        organizationId: 'red-cross',
        organizationName: 'Red Cross Sri Lanka',
        supplyCategory: 'Medical kits',
        quantity: 100,
        unit: 'kits',
      },
    ],
  },
};
export const emptyDashboard: Dashboard = {
  ...dashboard,
  metrics: {
    ...dashboard.metrics,
    totals: { alertsIssued: 0, reachPct: 0, peakOccupancy: 0, reliefDistributed: [] },
    recordCount: 0,
    alertTimeline: [],
    occupancySeries: [],
    distributionByDistrict: [],
    distributionByOrganisation: [],
    allocations: [],
  },
};

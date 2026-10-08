import type { ClusterDetail as Detail, Report } from '../api/types';
export const report = (status: Report['status'], id: string): Report => ({
  id,
  clientReportId: `client-${id}`,
  reporterId: 'citizen-1',
  reporterType: 'CITIZEN',
  hazardType: 'FLOOD',
  description: `${status} evidence`,
  location: { lat: 6.58, lng: 79.96, source: 'GPS' },
  capturedAt: '2026-10-07T09:00:00Z',
  receivedAt: '2026-10-07T09:00:00Z',
  syncedFromOffline: false,
  status,
});
export const cluster = (overrides: Partial<Detail> = {}): Detail => ({
  id: 'c1',
  district: 'KALUTARA',
  centroid: { lat: 6.6, lng: 79.9 },
  dominantHazardType: 'FLOOD',
  priorityScore: 87,
  band: 'HIGH',
  status: 'ESCALATION_RECOMMENDED',
  counts: { total: 3, pending: 1, verified: 1, rejected: 1 },
  escalation: { recommended: true, unmet: [], requiredVerified: 3 },
  firstReportedAt: '2026-10-07T09:00:00Z',
  lastReportAt: '2026-10-07T09:00:00Z',
  reports: [report('REJECTED', 'r3'), report('VERIFIED', 'r2'), report('PENDING', 'r1')],
  ...overrides,
});

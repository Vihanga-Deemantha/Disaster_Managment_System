import type { ClusterSummary } from '../api/types';
import { dashboardStats } from '../model/dashboardStats';
import { escalationState } from '../model/escalation';
import { bandTone, clusterStatusTone, reportStatusTone } from '../model/labels';
import { formatTime } from '../model/formatTime';

export function cluster(overrides: Partial<ClusterSummary> = {}): ClusterSummary {
  return {
    id: 'cluster-1',
    district: 'KALUTARA',
    centroid: { lat: 6.5, lng: 79.9 },
    dominantHazardType: 'FLOOD',
    priorityScore: 87,
    band: 'HIGH',
    status: 'OPEN',
    counts: { total: 4, pending: 3, verified: 1, rejected: 0 },
    escalation: { recommended: false, unmet: ['VERIFIED_REPORTS'], requiredVerified: 3 },
    firstReportedAt: '2026-10-07T09:02:00.000Z',
    lastReportAt: '2026-10-07T09:02:00.000Z',
    ...overrides,
  };
}

describe('UC-3 A2: cluster presentation decisions', () => {
  it('UC-3 A2: empty queue has zero stats', () => {
    expect(dashboardStats([])).toEqual({
      openClusters: 0,
      pendingReports: 0,
      highPriority: 0,
      escalationRecommended: 0,
    });
  });
  it('UC-3 A2: mixed queue counts reports, high bands and recommendations separately', () => {
    const input = [
      cluster(),
      cluster({
        band: 'LOW',
        status: 'ESCALATION_RECOMMENDED',
        counts: { total: 8, pending: 2, verified: 6, rejected: 0 },
      }),
    ];
    expect(dashboardStats(input)).toEqual({
      openClusters: 2,
      pendingReports: 5,
      highPriority: 1,
      escalationRecommended: 1,
    });
    expect(input[0].counts.pending).toBe(3);
  });
  it.each([
    ['ESCALATED', true, { kind: 'DONE' }],
    ['ESCALATED', false, { kind: 'DONE' }],
    ['OPEN', true, { kind: 'BLOCKED', unmet: ['VERIFIED_REPORTS'] }],
    ['CLOSED', false, { kind: 'BLOCKED', unmet: ['VERIFIED_REPORTS'] }],
    ['ESCALATION_RECOMMENDED', true, { kind: 'READY' }],
    ['ESCALATION_RECOMMENDED', false, { kind: 'OFFLINE' }],
  ] as const)('UC-3 A2: %s online=%s determines escalation', (status, online, expected) => {
    expect(escalationState(cluster({ status }), online)).toEqual(expected);
  });
  it.each([
    ['HIGH', 'bg-sev-critical text-white'],
    ['ELEVATED', 'bg-sev-high text-white'],
    ['MODERATE', 'bg-sev-medium text-white'],
    ['LOW', 'bg-sev-low text-white'],
  ] as const)('UC-3 A2: %s band uses a severity token', (band, tone) =>
    expect(bandTone(band)).toBe(tone),
  );
  it.each([
    ['PENDING', 'bg-warning-100 text-warning-600'],
    ['VERIFIED', 'bg-success-100 text-success-600'],
    ['REJECTED', 'bg-danger-100 text-danger-600'],
  ] as const)('UC-3 A2: %s report uses a status token', (status, tone) =>
    expect(reportStatusTone(status)).toBe(tone),
  );
  it.each([
    ['OPEN', 'bg-info-100 text-info-600'],
    ['ESCALATION_RECOMMENDED', 'bg-warning-100 text-warning-600'],
    ['ESCALATED', 'bg-success-100 text-success-600'],
    ['CLOSED', 'bg-paper text-ink-soft'],
  ] as const)('UC-3 A2: %s cluster uses a status token', (status, tone) =>
    expect(clusterStatusTone(status)).toBe(tone),
  );
  it.each([
    ['EN', '14:32', '00:00'],
    ['SI', '14.32', '00.00'],
    ['TA', '14:32', '00:00'],
  ] as const)('UC-3 A2: %s timestamps use Colombo time', (language, afternoon, midnight) => {
    expect(formatTime('2026-10-07T09:02:00.000Z', language)).toContain(afternoon);
    expect(formatTime('2026-10-07T18:30:00.000Z', language)).toContain(midnight);
  });
});

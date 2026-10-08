import type { ScoredCluster } from '../application/ClusteringService';
import { toClusterDetailDto, toClusterSummaryDto, toReportDto } from '../api/dto';
import { aCluster, aReport, BASE_TIME, KALUTARA, minutesAfter } from '../testing/builders';

describe('toReportDto', () => {
  it('a minimal report: dates become ISO strings and optional fields are absent', () => {
    const dto = toReportDto(aReport());
    expect(dto).toMatchObject({
      id: 'r-1',
      clientReportId: 'client-0001',
      reporterId: 'citizen-1',
      reporterType: 'CITIZEN',
      hazardType: 'FLOOD',
      description: 'Water is rising',
      location: { ...KALUTARA, source: 'GPS' },
      capturedAt: BASE_TIME.toISOString(),
      receivedAt: BASE_TIME.toISOString(),
      syncedFromOffline: false,
      status: 'PENDING',
    });
    expect(JSON.parse(JSON.stringify(dto))).not.toHaveProperty('photoUrl');
    expect(JSON.parse(JSON.stringify(dto))).not.toHaveProperty('reviewedAt');
  });

  it('a reviewed report with a photo exposes the photo url, reviewer and reason', () => {
    const dto = toReportDto(
      aReport({
        photo: { url: '/api/hazard-reports/photos/r-1.jpg', mime: 'image/jpeg', bytes: 9 },
        status: 'REJECTED',
        reviewedBy: 'usr-duty-1',
        reviewedAt: minutesAfter(20),
        rejectionReason: 'Spam',
        clusterId: 'cluster-1',
      }),
    );
    expect(dto).toMatchObject({
      photoUrl: '/api/hazard-reports/photos/r-1.jpg',
      status: 'REJECTED',
      reviewedBy: 'usr-duty-1',
      reviewedAt: minutesAfter(20).toISOString(),
      rejectionReason: 'Spam',
      clusterId: 'cluster-1',
    });
    expect(dto).not.toHaveProperty('photo');
  });
});

describe('cluster DTOs', () => {
  const scored: ScoredCluster = {
    cluster: aCluster({
      priorityScore: 87,
      band: 'HIGH',
      counts: { total: 1, pending: 1, verified: 0, rejected: 0 },
    }),
    reports: [aReport()],
    escalation: {
      recommended: false,
      unmet: ['VERIFIED_REPORTS'],
      verifiedCount: 0,
      requiredVerified: 3,
    },
  };

  it('the summary carries the score, counts and what escalation still needs', () => {
    expect(toClusterSummaryDto(scored)).toEqual({
      id: 'cluster-1',
      district: 'KALUTARA',
      centroid: KALUTARA,
      dominantHazardType: 'FLOOD',
      priorityScore: 87,
      band: 'HIGH',
      status: 'OPEN',
      counts: { total: 1, pending: 1, verified: 0, rejected: 0 },
      escalation: { recommended: false, unmet: ['VERIFIED_REPORTS'], requiredVerified: 3 },
      firstReportedAt: BASE_TIME.toISOString(),
      lastReportAt: BASE_TIME.toISOString(),
    });
  });

  it('the detail adds the cluster’s reports', () => {
    const detail = toClusterDetailDto(scored);
    expect(detail.id).toBe('cluster-1');
    expect(detail.reports.map((report) => report.id)).toEqual(['r-1']);
  });
});

import { ConflictError } from '@shared/errors/DomainError';
import { distanceKm } from '@shared/geo/GeoPoint';
import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { PriorityScore } from '../domain/PriorityScore';
import type { PriorityScorer } from '../domain/PriorityScorer';
import { ReportCluster } from '../domain/ReportCluster';
import type { ClusterStatus } from '../domain/types';
import { aCluster, aReport, BASE_TIME, KALUTARA, minutesAfter, north } from '../testing/builders';

const HOUR = 60;
const scorerReturning = (value: number): PriorityScorer => ({
  score: () => PriorityScore.of(value, config.bands),
});

describe('ReportCluster.open', () => {
  it('UC-3 A3: starts a single-report cluster centred on that report', () => {
    const first = aReport({ id: 'r-7', capturedAt: minutesAfter(5) });
    const cluster = ReportCluster.open('cluster-9', first, 'KALUTARA');
    expect(cluster.snapshot()).toMatchObject({
      id: 'cluster-9',
      district: 'KALUTARA',
      reportIds: ['r-7'],
      dominantHazardType: 'FLOOD',
      status: 'OPEN',
      counts: { total: 1, pending: 1, verified: 0, rejected: 0 },
      firstReportedAt: minutesAfter(5),
      lastReportAt: minutesAfter(5),
    });
    expect(cluster.snapshot().centroid).toEqual({ lat: KALUTARA.lat, lng: KALUTARA.lng });
  });
});

describe('ReportCluster.canAccept', () => {
  const candidate = (metres: number) =>
    aReport({ id: 'r-2', location: { ...north(KALUTARA, metres), source: 'GPS' } });

  it('UC-3 step 8: accepts a report inside the radius and the window', () => {
    expect(aCluster().canAccept(candidate(1500), config, minutesAfter(30))).toBe(true);
  });

  it('refuses a report 2.1 km away', () => {
    expect(aCluster().canAccept(candidate(2100), config, BASE_TIME)).toBe(false);
  });

  it('accepts a report at exactly the radius (boundary)', () => {
    const report = candidate(1900);
    const exact = distanceKm(KALUTARA, report.location);
    expect(aCluster().canAccept(report, { ...config, clusterRadiusKm: exact }, BASE_TIME)).toBe(
      true,
    );
    expect(
      aCluster().canAccept(report, { ...config, clusterRadiusKm: exact - 0.001 }, BASE_TIME),
    ).toBe(false);
  });

  it('accepts when the latest report is exactly 6 h old; refuses 1 minute later', () => {
    expect(aCluster().canAccept(candidate(0), config, minutesAfter(6 * HOUR))).toBe(true);
    expect(aCluster().canAccept(candidate(0), config, minutesAfter(6 * HOUR + 1))).toBe(false);
  });

  it.each([
    ['OPEN', true],
    ['ESCALATION_RECOMMENDED', true],
    ['ESCALATED', false],
    ['CLOSED', false],
  ] as [ClusterStatus, boolean][])('a %s cluster accepts reports: %s', (status, expected) => {
    expect(aCluster({ status }).canAccept(candidate(0), config, BASE_TIME)).toBe(expected);
  });
});

describe('ReportCluster.add', () => {
  it('UC-3 step 9: moves the centroid to the mean and records the report', () => {
    const cluster = aCluster();
    const far = north(KALUTARA, 1000);
    cluster.add(
      aReport({ id: 'r-2', location: { ...far, source: 'GPS' }, capturedAt: minutesAfter(10) }),
    );
    const state = cluster.snapshot();
    expect(state.reportIds).toEqual(['r-1', 'r-2']);
    expect(state.centroid.lat).toBeCloseTo((KALUTARA.lat + far.lat) / 2, 10);
    expect(state.lastReportAt).toEqual(minutesAfter(10));
  });

  it('UC-3 A1: an older offline report lowers the first time but does not make the cluster look newer', () => {
    const cluster = aCluster();
    cluster.add(aReport({ id: 'r-2', capturedAt: minutesAfter(-30) }));
    const state = cluster.snapshot();
    expect(state.firstReportedAt).toEqual(minutesAfter(-30));
    expect(state.lastReportAt).toEqual(BASE_TIME);
  });

  it('a report between the first and last times changes neither', () => {
    const cluster = aCluster({
      firstReportedAt: minutesAfter(-60),
      lastReportAt: minutesAfter(60),
    });
    cluster.add(aReport({ id: 'r-2', capturedAt: BASE_TIME }));
    const state = cluster.snapshot();
    expect(state.firstReportedAt).toEqual(minutesAfter(-60));
    expect(state.lastReportAt).toEqual(minutesAfter(60));
  });
});

describe('ReportCluster.rescore', () => {
  const NOW = minutesAfter(15);

  it('UC-3 step 10: takes score and band from the scorer and counts reports by status', () => {
    const cluster = aCluster();
    const reports = [
      aReport({ id: 'a' }),
      aReport({ id: 'b', status: 'VERIFIED' }),
      aReport({ id: 'c', status: 'VERIFIED' }),
      aReport({ id: 'd', status: 'REJECTED' }),
    ];
    cluster.rescore(reports, scorerReturning(80), NOW);
    expect(cluster.snapshot()).toMatchObject({
      priorityScore: 80,
      band: 'HIGH',
      counts: { total: 4, pending: 1, verified: 2, rejected: 1 },
    });
  });

  it('the most frequent active hazard type becomes dominant', () => {
    const cluster = aCluster();
    const reports = [
      aReport({ id: 'a', hazardType: 'ROAD_BLOCKAGE' }),
      aReport({ id: 'b', hazardType: 'ROAD_BLOCKAGE' }),
      aReport({ id: 'c', hazardType: 'FLOOD' }),
    ];
    cluster.rescore(reports, scorerReturning(40), NOW);
    expect(cluster.snapshot().dominantHazardType).toBe('ROAD_BLOCKAGE');
  });

  it('a tie goes to the more severe type (landslide over flood)', () => {
    const cluster = aCluster();
    const reports = [
      aReport({ id: 'a', hazardType: 'FLOOD' }),
      aReport({ id: 'b', hazardType: 'LANDSLIDE' }),
    ];
    cluster.rescore(reports, scorerReturning(60), NOW);
    expect(cluster.snapshot().dominantHazardType).toBe('LANDSLIDE');
  });

  it('UC-3 A2: rejected reports do not count towards the dominant type', () => {
    const cluster = aCluster();
    const reports = [
      aReport({ id: 'a', hazardType: 'LANDSLIDE', status: 'REJECTED' }),
      aReport({ id: 'b', hazardType: 'LANDSLIDE', status: 'REJECTED' }),
      aReport({ id: 'c', hazardType: 'FLOOD' }),
    ];
    cluster.rescore(reports, scorerReturning(50), NOW);
    expect(cluster.snapshot().dominantHazardType).toBe('FLOOD');
  });

  it('UC-3 A2/H8: a cluster with only rejected reports is closed and keeps its last dominant type', () => {
    const cluster = aCluster({ dominantHazardType: 'LANDSLIDE' });
    cluster.rescore(
      [aReport({ status: 'REJECTED', hazardType: 'FLOOD' })],
      scorerReturning(0),
      NOW,
    );
    expect(cluster.snapshot()).toMatchObject({ status: 'CLOSED', dominantHazardType: 'LANDSLIDE' });
  });

  it('an escalated cluster stays escalated even if every report is later rejected', () => {
    const cluster = aCluster({ status: 'ESCALATED' });
    cluster.rescore([aReport({ status: 'REJECTED' })], scorerReturning(0), NOW);
    expect(cluster.status).toBe('ESCALATED');
  });
});

describe('ReportCluster.recommend', () => {
  it('UC-3 step 15: toggles between Open and Escalation recommended', () => {
    const cluster = aCluster();
    cluster.recommend(true);
    expect(cluster.status).toBe('ESCALATION_RECOMMENDED');
    cluster.recommend(false);
    expect(cluster.status).toBe('OPEN');
  });

  it.each(['ESCALATED', 'CLOSED'] as const)('does not move a %s cluster', (status) => {
    const cluster = aCluster({ status });
    cluster.recommend(true);
    expect(cluster.status).toBe(status);
  });
});

describe('ReportCluster.markEscalated', () => {
  it('UC-3 step 16: a recommended cluster becomes Escalated with who and when', () => {
    const cluster = aCluster({ status: 'ESCALATION_RECOMMENDED' });
    cluster.markEscalated('usr-duty-1', BASE_TIME);
    expect(cluster.snapshot()).toMatchObject({
      status: 'ESCALATED',
      escalatedBy: 'usr-duty-1',
      escalatedAt: BASE_TIME,
    });
  });

  it.each(['OPEN', 'ESCALATED', 'CLOSED'] as const)(
    'H4: a %s cluster cannot be escalated',
    (status) => {
      const cluster = aCluster({ status });
      expect(() => cluster.markEscalated('usr-duty-1', BASE_TIME)).toThrow(ConflictError);
      expect(() => cluster.markEscalated('usr-duty-1', BASE_TIME)).toThrow('cannot be escalated');
      expect(cluster.status).toBe(status);
    },
  );
});

describe('ReportCluster state handling', () => {
  it('exposes id and status', () => {
    const cluster = aCluster({ id: 'cluster-5' });
    expect(cluster.id).toBe('cluster-5');
    expect(cluster.status).toBe('OPEN');
  });

  it('restore and snapshot copy the report id list', () => {
    const cluster = aCluster();
    const copy = cluster.snapshot();
    copy.reportIds.push('tampered');
    expect(cluster.snapshot().reportIds).toEqual(['r-1']);
  });
});

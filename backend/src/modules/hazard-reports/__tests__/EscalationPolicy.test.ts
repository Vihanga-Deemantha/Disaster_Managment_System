import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { EscalationPolicy, severityFor, type EscalationInput } from '../domain/EscalationPolicy';
import type { ReportHazardType, ReportStatus } from '../domain/types';

const policy = new EscalationPolicy(config);
const item = (status: ReportStatus, hazardType: ReportHazardType) => ({ status, hazardType });
const several = (n: number, status: ReportStatus, hazardType: ReportHazardType) =>
  Array.from({ length: n }, () => item(status, hazardType));
const input = (over: Partial<EscalationInput>): EscalationInput => ({
  band: 'HIGH',
  dominantHazardType: 'FLOOD',
  reports: [],
  ...over,
});

describe('EscalationPolicy.evaluate', () => {
  it('UC-3 step 15: High band with 3 verified flood reports is recommended', () => {
    const decision = policy.evaluate(
      input({ reports: [...several(3, 'VERIFIED', 'FLOOD'), ...several(2, 'PENDING', 'FLOOD')] }),
    );
    expect(decision).toEqual({
      recommended: true,
      unmet: [],
      verifiedCount: 3,
      requiredVerified: 3,
      hazardType: 'FLOOD',
      proposedSeverity: 'HIGH',
    });
  });

  it('High with 2 verified is not recommended', () => {
    const decision = policy.evaluate(input({ reports: several(2, 'VERIFIED', 'FLOOD') }));
    expect(decision.recommended).toBe(false);
    expect(decision.unmet).toEqual(['VERIFIED_REPORTS']);
    expect(decision.verifiedCount).toBe(2);
  });

  it('Elevated with 5 verified is not recommended', () => {
    const decision = policy.evaluate(
      input({ band: 'ELEVATED', reports: several(5, 'VERIFIED', 'FLOOD') }),
    );
    expect(decision.unmet).toEqual(['HIGH_BAND']);
  });

  it('H11: a road-blockage-only cluster is never recommended', () => {
    const decision = policy.evaluate(
      input({
        dominantHazardType: 'ROAD_BLOCKAGE',
        reports: several(3, 'VERIFIED', 'ROAD_BLOCKAGE'),
      }),
    );
    expect(decision.unmet).toEqual(['WARNABLE_HAZARD']);
    expect(decision.hazardType).toBeUndefined();
    expect(decision.proposedSeverity).toBeUndefined();
  });

  it('H11: road blockage dominant but a landslide and a flood present → LANDSLIDE, MEDIUM', () => {
    const decision = policy.evaluate(
      input({
        dominantHazardType: 'ROAD_BLOCKAGE',
        reports: [
          ...several(3, 'VERIFIED', 'ROAD_BLOCKAGE'),
          item('PENDING', 'LANDSLIDE'),
          item('PENDING', 'FLOOD'),
        ],
      }),
    );
    expect(decision.recommended).toBe(true);
    expect(decision.hazardType).toBe('LANDSLIDE');
    expect(decision.proposedSeverity).toBe('MEDIUM');
  });

  it('H11: road blockage dominant with only a flood present → FLOOD', () => {
    const decision = policy.evaluate(
      input({
        dominantHazardType: 'ROAD_BLOCKAGE',
        reports: [...several(3, 'VERIFIED', 'ROAD_BLOCKAGE'), item('PENDING', 'FLOOD')],
      }),
    );
    expect(decision.hazardType).toBe('FLOOD');
  });

  it('a rejected flood report does not make the cluster warnable', () => {
    const decision = policy.evaluate(
      input({
        dominantHazardType: 'OTHER',
        reports: [...several(3, 'VERIFIED', 'OTHER'), item('REJECTED', 'FLOOD')],
      }),
    );
    expect(decision.unmet).toEqual(['WARNABLE_HAZARD']);
  });

  it('lists every unmet requirement', () => {
    const decision = policy.evaluate(
      input({ band: 'LOW', dominantHazardType: 'OTHER', reports: [] }),
    );
    expect(decision.unmet).toEqual(['HIGH_BAND', 'VERIFIED_REPORTS', 'WARNABLE_HAZARD']);
    expect(decision.recommended).toBe(false);
  });
});

describe('severityFor', () => {
  it.each([
    ['HIGH', 'LANDSLIDE', 'HIGH'],
    ['HIGH', 'FLOOD', 'HIGH'],
    ['ELEVATED', 'FLOOD', 'MEDIUM'],
    ['HIGH', 'ROAD_BLOCKAGE', 'MEDIUM'],
  ] as const)('%s band with dominant %s → %s', (band, dominant, expected) => {
    expect(severityFor(band, dominant)).toBe(expected);
  });
});

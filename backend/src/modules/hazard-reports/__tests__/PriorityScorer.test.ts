import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { PriorityScore } from '../domain/PriorityScore';
import { WeightedPriorityScorer, type ScorableReport } from '../domain/PriorityScorer';

const NOW = new Date('2026-10-07T09:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const report = (over: Partial<ScorableReport> = {}): ScorableReport => ({
  reporterType: 'CITIZEN',
  hazardType: 'FLOOD',
  capturedAt: NOW,
  status: 'PENDING',
  ...over,
});
const many = (n: number, over: Partial<ScorableReport> = {}) =>
  Array.from({ length: n }, () => report(over));
const scorer = new WeightedPriorityScorer(config);

describe('WeightedPriorityScorer.score', () => {
  it('UC-3 step 10: the report worked example (8 citizens + 4 volunteers, flood, newest 30 min ago) scores 92', () => {
    const reports = [
      ...many(8, { capturedAt: minutesAgo(30) }),
      ...many(4, { reporterType: 'VOLUNTEER', capturedAt: minutesAgo(90) }),
    ];
    expect(scorer.score(reports, NOW)).toEqual({ value: 92, band: 'HIGH' });
  });

  it('UC-3 A3: a single citizen "other" report just now scores 39 (Moderate)', () => {
    expect(scorer.score([report({ hazardType: 'OTHER' })], NOW)).toEqual({
      value: 39,
      band: 'MODERATE',
    });
  });

  it('weighs a volunteer 1.5 times a citizen', () => {
    const old = { hazardType: 'OTHER', capturedAt: minutesAgo(360) } as const;
    expect(scorer.score(many(4, old), NOW).value).toBe(27); // 100 × (0.45 × 0.4 + 0.09)
    expect(scorer.score(many(4, { ...old, reporterType: 'VOLUNTEER' }), NOW).value).toBe(36); // 0.45 × 0.6 + 0.09
  });

  it('rounds an exact half up despite floating-point noise (single flood report just now = 53.5 → 54)', () => {
    expect(scorer.score([report()], NOW)).toEqual({ value: 54, band: 'ELEVATED' });
  });

  it('UC-3 A2: ignores rejected reports', () => {
    const reports = [report(), report({ status: 'REJECTED', hazardType: 'LANDSLIDE' })];
    expect(scorer.score(reports, NOW)).toEqual(scorer.score([report()], NOW));
  });

  it('caps density at 1', () => {
    expect(scorer.score(many(10), NOW).value).toBe(scorer.score(many(40), NOW).value);
  });

  it.each([[360], [900]])('recency is 0 at and beyond the window (%i min)', (age) => {
    expect(scorer.score(many(10, { capturedAt: minutesAgo(age) }), NOW).value).toBe(69); // 45 + 24 + 0
  });

  it('a report stamped slightly in the future does not push recency above 1', () => {
    expect(scorer.score(many(10, { capturedAt: minutesAgo(-2) }), NOW).value).toBe(94);
  });

  it('an empty or fully rejected set scores 0 (Low)', () => {
    expect(scorer.score([], NOW)).toEqual({ value: 0, band: 'LOW' });
    expect(scorer.score([report({ status: 'REJECTED' })], NOW)).toEqual({ value: 0, band: 'LOW' });
  });
});

describe('PriorityScore.of', () => {
  it.each([
    [29, 'LOW'],
    [30, 'MODERATE'],
    [49, 'MODERATE'],
    [50, 'ELEVATED'],
    [74, 'ELEVATED'],
    [75, 'HIGH'],
  ] as const)('band boundary: %i is %s', (value, band) => {
    expect(PriorityScore.of(value, config.bands).band).toBe(band);
  });

  it('clamps to 0–100 and rounds', () => {
    expect(PriorityScore.of(-4, config.bands).value).toBe(0);
    expect(PriorityScore.of(140.2, config.bands).value).toBe(100);
    expect(PriorityScore.of(61.4, config.bands).value).toBe(61);
  });
});

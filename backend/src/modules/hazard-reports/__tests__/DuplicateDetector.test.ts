import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { DuplicateDetector, type DuplicateCandidate } from '../domain/DuplicateDetector';
import { aReport, BASE_TIME, KALUTARA, minutesAfter, north } from '../testing/builders';

const detector = new DuplicateDetector(config);
const candidate = (over: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  reporterId: 'citizen-1',
  location: north(KALUTARA, 50),
  capturedAt: minutesAfter(10),
  ...over,
});

describe('DuplicateDetector.find', () => {
  it('UC-3 E3: the same reporter within 200 m and 30 min is a duplicate', () => {
    const existing = aReport();
    expect(detector.find(candidate(), [existing])).toBe(existing);
  });

  it('a different reporter is not a duplicate', () => {
    expect(detector.find(candidate({ reporterId: 'citizen-2' }), [aReport()])).toBeUndefined();
  });

  it('199 m away is a duplicate; 201 m is not', () => {
    expect(detector.find(candidate({ location: north(KALUTARA, 199) }), [aReport()])).toBeDefined();
    expect(
      detector.find(candidate({ location: north(KALUTARA, 201) }), [aReport()]),
    ).toBeUndefined();
  });

  it('exactly 30 minutes later is a duplicate; 31 minutes is not', () => {
    expect(detector.find(candidate({ capturedAt: minutesAfter(30) }), [aReport()])).toBeDefined();
    expect(detector.find(candidate({ capturedAt: minutesAfter(31) }), [aReport()])).toBeUndefined();
  });

  it('UC-3 A1/E3: an offline capture made 20 minutes before the existing report is a duplicate', () => {
    const existing = aReport({ capturedAt: minutesAfter(20) });
    expect(detector.find(candidate({ capturedAt: BASE_TIME }), [existing])).toBe(existing);
  });

  it.each(['VERIFIED', 'REJECTED'] as const)(
    'an existing %s report is never a duplicate target',
    (status) => {
      expect(detector.find(candidate(), [aReport({ status })])).toBeUndefined();
    },
  );

  it('with two matches, picks the one closest in time', () => {
    const farther = aReport({ id: 'r-far', capturedAt: minutesAfter(-15) });
    const closer = aReport({ id: 'r-close', capturedAt: minutesAfter(8) });
    expect(detector.find(candidate(), [farther, closer])).toBe(closer);
  });

  it('no existing reports → no duplicate', () => {
    expect(detector.find(candidate(), [])).toBeUndefined();
  });
});

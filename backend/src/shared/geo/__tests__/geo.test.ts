import { DISTRICTS } from '../../contracts/enums';
import { CentroidDistrictLocator, DISTRICT_CENTROIDS } from '../districts';
import {
  distanceKm,
  isValidGeoPoint,
  isWithinSriLanka,
  pointInRing,
  type GeoPoint,
} from '../GeoPoint';

const square: GeoPoint[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 10 },
  { lat: 10, lng: 10 },
  { lat: 10, lng: 0 },
];

describe('isValidGeoPoint', () => {
  it('accepts coordinates on the globe, including the extremes', () => {
    expect(isValidGeoPoint({ lat: 90, lng: 180 })).toBe(true);
    expect(isValidGeoPoint({ lat: -90, lng: -180 })).toBe(true);
  });

  it('rejects out-of-range and non-finite coordinates', () => {
    expect(isValidGeoPoint({ lat: 90.01, lng: 0 })).toBe(false);
    expect(isValidGeoPoint({ lat: 0, lng: 180.01 })).toBe(false);
    expect(isValidGeoPoint({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isValidGeoPoint({ lat: 0, lng: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('isWithinSriLanka', () => {
  it('accepts Colombo and Jaffna, and rejects London and the Maldives', () => {
    expect(isWithinSriLanka({ lat: 6.9271, lng: 79.8612 })).toBe(true);
    expect(isWithinSriLanka({ lat: 9.6615, lng: 80.0255 })).toBe(true);
    expect(isWithinSriLanka({ lat: 51.5, lng: -0.12 })).toBe(false);
    expect(isWithinSriLanka({ lat: 4.17, lng: 73.5 })).toBe(false);
  });

  it('treats each bounding-box edge as inside and just beyond it as outside', () => {
    expect(isWithinSriLanka({ lat: 5.7, lng: 80 })).toBe(true);
    expect(isWithinSriLanka({ lat: 5.69, lng: 80 })).toBe(false);
    expect(isWithinSriLanka({ lat: 10, lng: 80 })).toBe(true);
    expect(isWithinSriLanka({ lat: 10.01, lng: 80 })).toBe(false);
    expect(isWithinSriLanka({ lat: 7, lng: 79.4 })).toBe(true);
    expect(isWithinSriLanka({ lat: 7, lng: 79.39 })).toBe(false);
    expect(isWithinSriLanka({ lat: 7, lng: 82.1 })).toBe(true);
    expect(isWithinSriLanka({ lat: 7, lng: 82.11 })).toBe(false);
  });
});

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm({ lat: 7, lng: 80 }, { lat: 7, lng: 80 })).toBe(0);
  });

  it('measures Colombo to Kandy at roughly 94 km', () => {
    const km = distanceKm({ lat: 6.9271, lng: 79.8612 }, { lat: 7.2906, lng: 80.6337 });

    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(98);
  });

  it('is symmetric', () => {
    const a = { lat: 6.5, lng: 80 };
    const b = { lat: 9, lng: 81 };

    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });
});

describe('pointInRing', () => {
  it('finds a point inside and one outside', () => {
    expect(pointInRing({ lat: 5, lng: 5 }, square)).toBe(true);
    expect(pointInRing({ lat: 15, lng: 5 }, square)).toBe(false);
    expect(pointInRing({ lat: 5, lng: -1 }, square)).toBe(false);
  });

  it('counts a point on an edge or a vertex as inside, so boundary citizens are never dropped', () => {
    expect(pointInRing({ lat: 0, lng: 5 }, square)).toBe(true);
    expect(pointInRing({ lat: 5, lng: 10 }, square)).toBe(true);
    expect(pointInRing({ lat: 10, lng: 10 }, square)).toBe(true);
    expect(pointInRing({ lat: 0, lng: 0 }, square)).toBe(true);
  });

  it('is not fooled by a point collinear with an edge but beyond it', () => {
    expect(pointInRing({ lat: 0, lng: 12 }, square)).toBe(false);
  });

  it('handles a concave polygon', () => {
    const lShape: GeoPoint[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 4, lng: 10 },
      { lat: 4, lng: 4 },
      { lat: 10, lng: 4 },
      { lat: 10, lng: 0 },
    ];

    expect(pointInRing({ lat: 8, lng: 2 }, lShape)).toBe(true);
    expect(pointInRing({ lat: 8, lng: 8 }, lShape)).toBe(false);
  });

  it('treats an empty ring as containing nothing', () => {
    expect(pointInRing({ lat: 1, lng: 1 }, [])).toBe(false);
  });
});

describe('CentroidDistrictLocator', () => {
  const locator = new CentroidDistrictLocator();

  it('knows a centre for each of the 25 districts', () => {
    expect(Object.keys(DISTRICT_CENTROIDS).sort()).toEqual([...DISTRICTS].sort());
  });

  it.each(DISTRICTS)('puts %s nearest to its own centre', (district) => {
    expect(locator.nearest(DISTRICT_CENTROIDS[district], 1)).toEqual([district]);
  });

  it('orders districts from nearest to furthest and honours the count', () => {
    const nearest = locator.nearest({ lat: 6.9271, lng: 79.8612 }, 3);

    expect(nearest).toHaveLength(3);
    expect(nearest[0]).toBe('COLOMBO');
    expect(nearest).toContain('GAMPAHA');
  });
});

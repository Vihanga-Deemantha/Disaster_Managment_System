import type { District } from '../contracts/enums';
import { distanceKm, type GeoPoint } from './GeoPoint';

/**
 * Approximate centre of each district. This is an approximation, not a boundary: it is only used to
 * sanity-check that a citizen's pin is near the district they claim (master plan §7.1.2). Swap in
 * real boundary polygons behind `DistrictLocator` if they become available.
 */
export const DISTRICT_CENTROIDS: Record<District, GeoPoint> = {
  AMPARA: { lat: 7.3, lng: 81.67 },
  ANURADHAPURA: { lat: 8.34, lng: 80.41 },
  BADULLA: { lat: 6.99, lng: 81.06 },
  BATTICALOA: { lat: 7.71, lng: 81.69 },
  COLOMBO: { lat: 6.93, lng: 79.86 },
  GALLE: { lat: 6.03, lng: 80.22 },
  GAMPAHA: { lat: 7.09, lng: 80.0 },
  HAMBANTOTA: { lat: 6.12, lng: 81.12 },
  JAFFNA: { lat: 9.66, lng: 80.01 },
  KALUTARA: { lat: 6.58, lng: 80.1 },
  KANDY: { lat: 7.29, lng: 80.63 },
  KEGALLE: { lat: 7.25, lng: 80.35 },
  KILINOCHCHI: { lat: 9.39, lng: 80.4 },
  KURUNEGALA: { lat: 7.49, lng: 80.37 },
  MANNAR: { lat: 8.98, lng: 79.92 },
  MATALE: { lat: 7.47, lng: 80.62 },
  MATARA: { lat: 5.95, lng: 80.55 },
  MONARAGALA: { lat: 6.87, lng: 81.35 },
  MULLAITIVU: { lat: 9.27, lng: 80.81 },
  NUWARA_ELIYA: { lat: 6.97, lng: 80.78 },
  POLONNARUWA: { lat: 7.94, lng: 81.0 },
  PUTTALAM: { lat: 8.03, lng: 79.83 },
  RATNAPURA: { lat: 6.68, lng: 80.4 },
  TRINCOMALEE: { lat: 8.57, lng: 81.23 },
  VAVUNIYA: { lat: 8.75, lng: 80.5 },
};

export interface DistrictLocator {
  /** Districts ordered from nearest to furthest, at most `count` of them. */
  nearest(point: GeoPoint, count: number): District[];
}

export class CentroidDistrictLocator implements DistrictLocator {
  nearest(point: GeoPoint, count: number): District[] {
    return (Object.entries(DISTRICT_CENTROIDS) as [District, GeoPoint][])
      .map(([district, centre]) => ({ district, km: distanceKm(point, centre) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, count)
      .map((entry) => entry.district);
  }
}

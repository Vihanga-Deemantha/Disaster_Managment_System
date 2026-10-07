/** A WGS-84 coordinate. Pure TypeScript so the frontend can share it through `@contracts`. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

/** Rough bounding box of Sri Lanka including its coastal waters. */
const SRI_LANKA_BOUNDS = { minLat: 5.7, maxLat: 10.0, minLng: 79.4, maxLng: 82.1 };

export const isValidGeoPoint = (value: GeoPoint): boolean =>
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lng) &&
  Math.abs(value.lat) <= 90 &&
  Math.abs(value.lng) <= 180;

export const isWithinSriLanka = (point: GeoPoint): boolean =>
  point.lat >= SRI_LANKA_BOUNDS.minLat &&
  point.lat <= SRI_LANKA_BOUNDS.maxLat &&
  point.lng >= SRI_LANKA_BOUNDS.minLng &&
  point.lng <= SRI_LANKA_BOUNDS.maxLng;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ray-casting point-in-polygon test for a single outer ring (no holes).
 * A point exactly on an edge or vertex counts as inside, so boundary citizens are never dropped
 * from an alert.
 */
export function pointInRing(point: GeoPoint, ring: readonly GeoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as GeoPoint;
    const b = ring[j] as GeoPoint;
    if (isOnSegment(point, a, b)) return true;
    const crosses =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

function isOnSegment(p: GeoPoint, a: GeoPoint, b: GeoPoint): boolean {
  const cross = (p.lat - a.lat) * (b.lng - a.lng) - (p.lng - a.lng) * (b.lat - a.lat);
  if (Math.abs(cross) > 1e-12) return false;
  return (
    p.lat >= Math.min(a.lat, b.lat) &&
    p.lat <= Math.max(a.lat, b.lat) &&
    p.lng >= Math.min(a.lng, b.lng) &&
    p.lng <= Math.max(a.lng, b.lng)
  );
}

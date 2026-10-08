import 'leaflet/dist/leaflet.css';
import type { LatLngBoundsLiteral } from 'leaflet';
import { Circle, MapContainer, Polygon, TileLayer } from 'react-leaflet';
import type { AreaDto, GeoPoint } from './types';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';
/** A district without a drawn boundary is shown as a circle about this big (metres). */
export const DISTRICT_RADIUS_METRES = 15_000;
/** The same circle in degrees, for fitting the map to it. */
const DISTRICT_RADIUS_DEGREES = 0.14;
/** Red outline, pale red fill: the affected area, as in the design. */
const AFFECTED = { color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.22, weight: 2 };

const pointOf = ({ lat, lng }: GeoPoint): [number, number] => [lat, lng];

/** Every point the map has to show: a boundary's corners, or the box around a district's centre. */
function pointsOf(area: AreaDto): GeoPoint[] {
  if (area.boundary && area.boundary.length > 0) return area.boundary;
  const { lat, lng } = area.center;
  return [
    { lat: lat - DISTRICT_RADIUS_DEGREES, lng: lng - DISTRICT_RADIUS_DEGREES },
    { lat: lat + DISTRICT_RADIUS_DEGREES, lng: lng + DISTRICT_RADIUS_DEGREES },
  ];
}

/** The smallest box that holds every area, for the map to zoom to. */
export function boundsOf(areas: readonly AreaDto[]): LatLngBoundsLiteral {
  const points = areas.flatMap(pointsOf);
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function AreaShape({ area }: { area: AreaDto }) {
  if (area.boundary && area.boundary.length > 0) {
    return <Polygon positions={area.boundary.map(pointOf)} pathOptions={AFFECTED} />;
  }
  return (
    <Circle center={pointOf(area.center)} radius={DISTRICT_RADIUS_METRES} pathOptions={AFFECTED} />
  );
}

/**
 * The target areas on a map (screen 2). Districts without a drawn boundary are circles; river basins
 * are their real outline. A small key in the corner names the red area. The tiles need a connection; the
 * text around the map never depends on them.
 */
export function WarningMap({
  areas,
  label,
  legend,
}: {
  areas: readonly AreaDto[];
  label: string;
  /** What the red area is, e.g. "Affected area (Gampaha)". */
  legend: string;
}) {
  if (areas.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className="relative overflow-hidden rounded-xl border border-line-soft"
    >
      <MapContainer
        bounds={boundsOf(areas)}
        boundsOptions={{ padding: [24, 24] }}
        scrollWheelZoom={false}
        className="h-72 w-full"
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        {areas.map((area) => (
          <AreaShape key={area.areaId} area={area} />
        ))}
      </MapContainer>
      <p className="absolute right-3 bottom-8 z-[1000] flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-md">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-red-600" />
        {legend}
      </p>
    </div>
  );
}

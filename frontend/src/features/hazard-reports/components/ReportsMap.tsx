import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface ReportsMapProps {
  centre: { lat: number; lng: number };
  pins: { id: string; lat: number; lng: number; label: string }[];
  ariaLabel: string;
}

export function ReportsMap({ centre, pins, ariaLabel }: ReportsMapProps) {
  return (
    <section aria-label={ariaLabel}>
      <MapContainer center={[centre.lat, centre.lng]} zoom={14} className="h-80 w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
        />
        {pins.map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]}>
            <Popup>{pin.label}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </section>
  );
}

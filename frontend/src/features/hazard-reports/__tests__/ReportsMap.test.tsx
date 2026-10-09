import type { ReactNode } from 'react';
import { expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { ReportsMap } from '../components/ReportsMap';

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('react-leaflet', () => ({
  // Like v5, this double does not forward aria-label to the map div.
  MapContainer: ({
    center,
    zoom,
    children,
  }: {
    center: number[];
    zoom: number;
    children: ReactNode;
  }) => (
    <div data-testid="map" data-center={center.join(',')} data-zoom={zoom}>
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <div data-testid="tiles" data-url={url}>
      {attribution}
    </div>
  ),
  Marker: ({ position, children }: { position: number[]; children: ReactNode }) => (
    <div data-testid="marker" data-position={position.join(',')}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

it('UC-3 A2: names the map and places each labeled report on configured street tiles', () => {
  render(
    <ReportsMap
      centre={{ lat: 6.58, lng: 79.96 }}
      ariaLabel="Cluster reports map"
      pins={[
        { id: 'a', lat: 6.57, lng: 79.95, label: 'Flood by bridge' },
        { id: 'b', lat: 6.59, lng: 79.97, label: 'Blocked road' },
      ]}
    />,
  );
  const map = within(screen.getByRole('region', { name: 'Cluster reports map' }));
  expect(map.getByTestId('map')).toHaveAttribute('data-center', '6.58,79.96');
  expect(map.getByTestId('map')).toHaveAttribute('data-zoom', '14');
  expect(map.getByTestId('tiles')).toHaveAttribute(
    'data-url',
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  );
  expect(map.getByTestId('tiles')).toHaveTextContent('© OpenStreetMap contributors');
  const markers = map.getAllByTestId('marker');
  expect(markers).toHaveLength(2);
  expect(markers[0]).toHaveAttribute('data-position', '6.57,79.95');
  expect(markers[0]).toHaveTextContent('Flood by bridge');
  expect(markers[1]).toHaveAttribute('data-position', '6.59,79.97');
  expect(markers[1]).toHaveTextContent('Blocked road');
});
it('UC-3 A2: a map without reports remains labeled and has no markers', () => {
  render(<ReportsMap centre={{ lat: 7, lng: 80 }} ariaLabel="Empty cluster map" pins={[]} />);
  expect(screen.getByRole('region', { name: 'Empty cluster map' })).toBeVisible();
  expect(screen.queryByTestId('marker')).not.toBeInTheDocument();
});
it('UC-3 A2: default Leaflet icons use Vite imported image URLs', () => {
  expect(L.Icon.Default.prototype.options.iconUrl).toMatch(
    /leaflet\/dist\/images\/marker-icon\.png/,
  );
  expect(L.Icon.Default.prototype.options.iconRetinaUrl).toMatch(
    /leaflet\/dist\/images\/marker-icon-2x\.png/,
  );
  expect(L.Icon.Default.prototype.options.shadowUrl).toMatch(
    /leaflet\/dist\/images\/marker-shadow\.png/,
  );
});

it.each([1, 2])(
  'UC-3 A2: real marker images keep imported URLs despite CSS detection at pixel ratio %s',
  async (pixelRatio) => {
    vi.resetModules();
    const originalRetina = L.Browser.retina;
    const style = document.createElement('style');
    style.textContent =
      '.leaflet-default-icon-path { background-image: url("/node_modules/leaflet/dist/images/marker-icon.png"); }';
    document.head.append(style);
    try {
      const { default: leaflet } = await import('leaflet');
      // Leaflet's CJS Browser flags are initialized once, even across resetModules.
      Object.defineProperty(leaflet.Browser, 'retina', {
        value: pixelRatio === 2,
        configurable: true,
      });
      Reflect.deleteProperty(leaflet.Icon.Default, 'imagePath');
      await import('../components/ReportsMap');
      const icon = new leaflet.Icon.Default();
      expect
        .soft(icon.createIcon().getAttribute('src'))
        .toBe(pixelRatio === 2 ? iconRetinaUrl : iconUrl);
      expect.soft(icon.createShadow()?.getAttribute('src')).toBe(shadowUrl);
    } finally {
      style.remove();
      Object.defineProperty(L.Browser, 'retina', { value: originalRetina, configurable: true });
    }
  },
);

import type { ReactNode } from 'react';

/**
 * Leaflet needs a real layout engine, which jsdom does not have. These stand-ins draw one element per
 * map part and put the props the app passed into `data-` attributes, so a test can check them.
 *
 *   vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);
 */
export const reactLeafletMock = {
  MapContainer: ({ children, bounds }: { children?: ReactNode; bounds?: unknown }) => (
    <div data-testid="map" data-bounds={JSON.stringify(bounds)}>
      {children}
    </div>
  ),
  TileLayer: ({ url }: { url: string }) => <span data-testid="tiles" data-url={url} />,
  Polygon: ({ positions }: { positions: unknown }) => (
    <span data-testid="polygon" data-positions={JSON.stringify(positions)} />
  ),
  Circle: ({ center, radius }: { center: unknown; radius: number }) => (
    <span data-testid="circle" data-center={JSON.stringify(center)} data-radius={radius} />
  ),
};

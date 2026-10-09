import { mapDocument } from '../components/mapDocument';

type Point = { lat: number; lng: number };
function mapHarness() {
  const messages: unknown[] = [];
  const mapEvents: Record<string, (event: { latlng: Point }) => void> = {};
  const markerEvents: Record<string, () => void> = {};
  const tileEvents: Record<string, () => void> = {};
  let position = { lat: 6.5, lng: 80 };
  let draggable = false;
  const map = {
    setView: jest.fn(),
    on: (event: string, callback: (typeof mapEvents)[string]) => {
      mapEvents[event] = callback;
    },
    getBounds: () => ({ contains: () => true }),
    panTo: jest.fn(),
    removeLayer: jest.fn(),
  };
  const marker = {
    addTo: jest.fn(),
    on: (event: string, callback: () => void) => {
      markerEvents[event] = callback;
    },
    setLatLng: ([lat, lng]: number[]) => {
      position = { lat, lng };
    },
    getLatLng: () => position,
    dragging: {
      enable: () => {
        draggable = true;
      },
      disable: () => {
        draggable = false;
      },
    },
  };
  const tiles = { on: jest.fn(), addTo: jest.fn() };
  map.setView.mockReturnValue(map);
  marker.addTo.mockReturnValue(marker);
  tiles.on.mockImplementation((event: string, callback: () => void) => {
    tileEvents[event] = callback;
    return tiles;
  });
  const L = {
    map: () => map,
    tileLayer: () => tiles,
    divIcon: jest.fn(),
    marker: ([lat, lng]: number[]) => {
      position = { lat, lng };
      return marker;
    },
  };
  const window: {
    ReactNativeWebView: { postMessage: (data: string) => void };
    updatePin?: (point: Point | null, editable: boolean, centre: Point) => void;
  } = {
    ReactNativeWebView: { postMessage: (data) => messages.push(JSON.parse(data)) },
  };
  const html = mapDocument(position);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const start = new Function(
    'window',
    'L',
    'setTimeout',
    'clearTimeout',
    `${script};return start;`,
  )(window, L, jest.fn(), jest.fn()) as () => void;
  start();
  return {
    window,
    messages,
    mapEvents,
    markerEvents,
    tileEvents,
    map,
    draggable: () => draggable,
    position: () => position,
    html,
  };
}
describe('UC-3 E1: embedded map interactions', () => {
  it('starts without report evidence; sends taps and drags only when editable', () => {
    const h = mapHarness();
    expect(h.messages).toEqual([{ type: 'READY' }]);
    const point = { lat: 6.6, lng: 80.1 };
    h.mapEvents.click({ latlng: point });
    expect(h.messages).toHaveLength(1);
    h.window.updatePin!(null, true, point);
    h.mapEvents.click({ latlng: point });
    expect(h.draggable()).toBe(true);
    expect(h.position()).toEqual(point);
    expect(h.messages[1]).toEqual({ type: 'PIN', ...point });
    h.markerEvents.dragend();
    expect(h.messages[2]).toEqual({ type: 'PIN', ...point });
    h.window.updatePin!(point, false, point);
    expect(h.draggable()).toBe(false);
    h.markerEvents.dragend();
    expect(h.messages).toHaveLength(3);
    h.tileEvents.tileerror();
    expect(h.messages[3]).toEqual({ type: 'ERROR' });
    expect(h.html).toContain('leaflet@1.9.4');
  });
});

import * as Location from 'expo-location';
import { InMemoryKeyValueStore } from '@/shared/testing/InMemoryKeyValueStore';
import { readCurrentLocation } from '../adapters/ExpoLocationProvider';
import { installMarker } from '../adapters/installMarker';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  LocationAccuracy: { High: 4 },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'fixed-uuid') }));

const mocked = Location as jest.Mocked<typeof Location>;
const permission = (granted: boolean) => ({ granted }) as never;

beforeEach(() => jest.clearAllMocks());

describe('readCurrentLocation', () => {
  it('reads the position at high accuracy and rounds it to about a metre', async () => {
    mocked.requestForegroundPermissionsAsync.mockResolvedValue(permission(true));
    mocked.hasServicesEnabledAsync.mockResolvedValue(true);
    mocked.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 7.087312345, longitude: 79.992587654 },
    } as never);

    expect(await readCurrentLocation()).toEqual({ status: 'ok', lat: '7.08731', lng: '79.99259' });
    expect(mocked.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 4 });
  });

  it('says denied, and never reads the position, when the person refuses', async () => {
    mocked.requestForegroundPermissionsAsync.mockResolvedValue(permission(false));

    expect(await readCurrentLocation()).toEqual({ status: 'denied' });
    expect(mocked.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('says unavailable when location services are switched off', async () => {
    mocked.requestForegroundPermissionsAsync.mockResolvedValue(permission(true));
    mocked.hasServicesEnabledAsync.mockResolvedValue(false);

    expect(await readCurrentLocation()).toEqual({ status: 'unavailable' });
    expect(mocked.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('says unavailable when the phone cannot find itself', async () => {
    mocked.requestForegroundPermissionsAsync.mockResolvedValue(permission(true));
    mocked.hasServicesEnabledAsync.mockResolvedValue(true);
    mocked.getCurrentPositionAsync.mockRejectedValue(new Error('timeout'));

    expect(await readCurrentLocation()).toEqual({ status: 'unavailable' });
  });
});

describe('installMarker', () => {
  it('makes a marker once, keeps it, and gives the same one afterwards', async () => {
    const storage = new InMemoryKeyValueStore();

    const first = await installMarker(storage);
    const second = await installMarker(storage);

    expect(first).toBe('safezone-app-fixed-uuid');
    expect(second).toBe(first);
    expect(storage.values.get('safezone.install-marker')).toBe(first);
  });

  it('gives back a marker that was already there', async () => {
    const storage = new InMemoryKeyValueStore();
    storage.values.set('safezone.install-marker', 'safezone-app-earlier');

    expect(await installMarker(storage)).toBe('safezone-app-earlier');
  });

  it('gives none, instead of failing, when the phone cannot store it', async () => {
    const storage = new InMemoryKeyValueStore();
    storage.breakWith();

    expect(await installMarker(storage)).toBeUndefined();
  });
});

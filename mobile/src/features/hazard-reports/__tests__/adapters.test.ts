import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { createApiClient } from '@/shared/api/apiClient';
import { ExpoPhotoPicker } from '../adapters/ExpoPhotoPicker';
import { ExpoLocationProvider } from '../adapters/ExpoLocationProvider';
import { createSubmitTransport } from '../adapters/MultipartTransport';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
const asset = {
  uri: 'file:///photo.jpg',
  fileName: 'source.jpg',
  mimeType: 'image/jpeg',
  fileSize: 100,
};
beforeEach(() => jest.resetAllMocks());
describe('UC-3 native capture adapters', () => {
  it('requests camera permission, takes a compressed still image, and keeps image metadata', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValue({ granted: true } as never);
    jest
      .mocked(ImagePicker.launchCameraAsync)
      .mockResolvedValue({ canceled: false, assets: [asset] } as never);
    expect(await new ExpoPhotoPicker().pick('CAMERA')).toEqual({ kind: 'PICKED', photo: asset });
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 0.6,
    });
  });
  it('does not launch a denied camera; gallery cancellation asks for no camera permission', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValue({ granted: false } as never);
    expect(await new ExpoPhotoPicker().pick('CAMERA')).toEqual({ kind: 'DENIED' });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: true, assets: null });
    expect(await new ExpoPhotoPicker().pick('GALLERY')).toEqual({ kind: 'CANCELLED' });
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 1,
    });
  });
  it('handles missing gallery assets or native launch failures without throwing', async () => {
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValueOnce({ canceled: false, assets: [] });
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockRejectedValueOnce(new Error('Unavailable'));
    const picker = new ExpoPhotoPicker();
    expect(await picker.pick('GALLERY')).toEqual({ kind: 'UNAVAILABLE' });
    expect(await picker.pick('GALLERY')).toEqual({ kind: 'UNAVAILABLE' });
  });
  it('maps foreground permission, high-accuracy coordinates and null accuracy/last-known location', async () => {
    const provider = new ExpoLocationProvider();
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValue({ status: 'granted' } as never);
    expect(await provider.requestPermission()).toBe(true);
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockResolvedValue({ coords: { latitude: 6.5, longitude: 80, accuracy: null } } as never);
    expect(await provider.current()).toEqual({ lat: 6.5, lng: 80, accuracyM: undefined });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.High,
    });
    jest
      .mocked(Location.getLastKnownPositionAsync)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ coords: { latitude: 7, longitude: 81 } } as never);
    expect(await provider.lastKnown()).toBeUndefined();
    expect(await provider.lastKnown()).toEqual({ lat: 7, lng: 81 });
  });
});
describe('UC-3 multipart transport with the shared session client', () => {
  const originalFormData = globalThis.FormData;
  beforeEach(() => {
    // Jest otherwise supplies Node's web FormData, which stringifies native file descriptors.
    globalThis.FormData = jest.requireActual<{ default: typeof FormData }>(
      'react-native/Libraries/Network/FormData',
    ).default;
  });
  afterEach(() => {
    globalThis.FormData = originalFormData;
  });
  it('sends native file parts with cookies and CSRF headers, leaving the boundary to React Native', async () => {
    let init: RequestInit | undefined;
    const fetchImpl = (async (_url, options) => {
      init = options;
      return {
        status: 201,
        json: async () => ({ outcome: 'CREATED', report: { id: 'r-1' } }),
      } as Response;
    }) as typeof fetch;
    const api = createApiClient({ baseUrl: 'http://test', fetchImpl });
    const result = await createSubmitTransport(api)([
      ['hazardType', 'FLOOD'],
      ['photo', { uri: asset.uri, name: 'photo.jpg', type: 'image/jpeg' }],
    ]);
    expect(result.status).toBe(201);
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toEqual({ Accept: 'application/json', 'X-Requested-With': 'SafeZone' });
    const form = init?.body as unknown as { getParts(): unknown[] };
    expect(form.getParts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldName: 'hazardType', string: 'FLOOD' }),
        expect.objectContaining({ fieldName: 'photo', uri: asset.uri, name: 'photo.jpg' }),
      ]),
    );
  });
});

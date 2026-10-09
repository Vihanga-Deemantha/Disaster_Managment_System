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
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get name() {
      return this.uri.split('/').pop();
    }
    get type() {
      return 'image/jpeg';
    }
    async bytes() {
      return new Uint8Array([255, 216, 255, 217]);
    }
  },
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
    globalThis.FormData = jest.requireActual<{ default: typeof FormData }>(
      'react-native/Libraries/Network/FormData',
    ).default;
    jest.requireActual('expo/src/winter/FormData').installFormDataPatch(globalThis.FormData);
  });
  afterEach(() => {
    globalThis.FormData = originalFormData;
  });
  it.each([true, false])(
    'encodes the request with Expo fetch (photo: %s), cookies and CSRF headers',
    async (withPhoto) => {
      let init: RequestInit | undefined;
      let encoded = '';
      const fetchImpl = (async (_url, options) => {
        init = options;
        const { body } = await jest
          .requireActual('expo/src/winter/fetch/convertFormData')
          .convertFormDataAsync(options?.body, 'test-boundary');
        encoded = Array.from(body as Uint8Array, (byte) => String.fromCharCode(byte)).join('');
        return {
          status: 201,
          json: async () => ({ outcome: 'CREATED', report: { id: 'r-1' } }),
        } as Response;
      }) as typeof fetch;
      const api = createApiClient({ baseUrl: 'http://test', fetchImpl });
      const result = await createSubmitTransport(api)([
        ['hazardType', 'FLOOD'],
        ...(withPhoto
          ? [
              ['photo', { uri: asset.uri, name: 'photo.jpg', type: 'image/jpeg' }] as [
                string,
                { uri: string; name: string; type: string },
              ],
            ]
          : []),
      ]);
      expect(result.status).toBe(201);
      expect(init?.credentials).toBe('include');
      expect(init?.headers).toEqual({ Accept: 'application/json', 'X-Requested-With': 'SafeZone' });
      expect(encoded).toContain('name="hazardType"\r\n\r\nFLOOD');
      if (withPhoto) {
        expect(encoded).toContain('name="photo"; filename="photo.jpg"');
        expect(encoded).toContain('content-type: image/jpeg');
        expect(encoded).toContain(String.fromCharCode(255, 216, 255, 217));
      } else {
        expect(encoded).not.toContain('name="photo"');
      }
    },
  );
});

import * as ImagePicker from 'expo-image-picker';
import type { PickedPhoto } from '../domain/types';

export type PhotoPickResult =
  { kind: 'PICKED'; photo: PickedPhoto } | { kind: 'CANCELLED' | 'DENIED' | 'UNAVAILABLE' };
export interface PhotoPicker {
  pick(source: 'CAMERA' | 'GALLERY'): Promise<PhotoPickResult>;
}
export class ExpoPhotoPicker implements PhotoPicker {
  async pick(source: 'CAMERA' | 'GALLERY'): Promise<PhotoPickResult> {
    try {
      if (source === 'CAMERA' && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
        return { kind: 'DENIED' };
      const result =
        source === 'CAMERA'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled) return { kind: 'CANCELLED' };
      const asset = result.assets[0];
      return asset
        ? {
            kind: 'PICKED',
            photo: {
              uri: asset.uri,
              fileName: asset.fileName,
              mimeType: asset.mimeType,
              fileSize: asset.fileSize,
            },
          }
        : { kind: 'UNAVAILABLE' };
    } catch {
      return { kind: 'UNAVAILABLE' };
    }
  }
}

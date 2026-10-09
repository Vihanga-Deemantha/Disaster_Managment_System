import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PhotoStorage } from '../application/ports';
import type { ReportPhoto, UploadedPhoto } from '../domain/types';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const PHOTO_ROUTE = '/api/hazard-reports/photos';
const SAFE_KEY = /^[A-Za-z0-9-]+$/;
/** Only names this class produces are ever served: no path can be smuggled in. */
export const PHOTO_FILE_NAME = /^[A-Za-z0-9-]+\.(jpg|png|webp)$/;

export class DiskPhotoStorage implements PhotoStorage {
  constructor(private readonly directory: string) {}

  async save(key: string, photo: UploadedPhoto): Promise<ReportPhoto> {
    const extension = EXTENSIONS[photo.mimeType];
    if (!SAFE_KEY.test(key) || !extension) {
      throw new Error(`Cannot store a ${photo.mimeType} photo under the key "${key}".`);
    }
    await mkdir(this.directory, { recursive: true });
    const fileName = `${key}.${extension}`;
    await writeFile(join(this.directory, fileName), photo.content);
    return {
      url: `${PHOTO_ROUTE}/${fileName}`,
      mime: photo.mimeType,
      bytes: photo.content.byteLength,
    };
  }

  /** Deleting a photo that is already gone, or that this class did not store, is not an error. */
  async remove(photo: ReportPhoto): Promise<void> {
    const file = this.resolve(photo.url.slice(PHOTO_ROUTE.length + 1));
    if (file) await rm(file, { force: true });
  }

  /** Absolute path of a stored photo, or undefined when the name is not one of ours. */
  resolve(fileName: string): string | undefined {
    return PHOTO_FILE_NAME.test(fileName) ? join(this.directory, fileName) : undefined;
  }
}

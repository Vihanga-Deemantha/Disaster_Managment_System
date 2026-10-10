import { ValidationError } from '@shared/errors/DomainError';
import type { ClusteringConfig } from './ClusteringConfig';
import type { UploadedPhoto } from './types';

export type PhotoProblem = 'PHOTO_EMPTY' | 'PHOTO_TOO_LARGE' | 'PHOTO_TYPE' | 'PHOTO_UNREADABLE';

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);

/** The first bytes every real file of that type begins with: a renamed text file fails here. */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  'image/png': (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]),
  'image/webp': (bytes) =>
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8),
};

export class PhotoValidator {
  constructor(
    private readonly config: Pick<ClusteringConfig, 'photoMaxBytes' | 'photoMimeTypes'>,
  ) {}

  /** UC-3 E2: why the photo cannot be accepted, or undefined when it can. */
  check(photo: UploadedPhoto): PhotoProblem | undefined {
    if (photo.content.byteLength === 0) return 'PHOTO_EMPTY';
    if (photo.content.byteLength > this.config.photoMaxBytes) return 'PHOTO_TOO_LARGE';
    if (!this.config.photoMimeTypes.includes(photo.mimeType)) return 'PHOTO_TYPE';
    const matches = SIGNATURES[photo.mimeType];
    return matches?.(photo.content) ? undefined : 'PHOTO_UNREADABLE';
  }

  /** UC-3 E2: throws `INVALID_PHOTO` naming the problem. */
  assertValid(photo: UploadedPhoto): void {
    const problem = this.check(photo);
    if (problem) {
      throw new ValidationError(
        [{ field: 'photo', code: problem }],
        'The photo could not be accepted.',
        'INVALID_PHOTO',
      );
    }
  }
}

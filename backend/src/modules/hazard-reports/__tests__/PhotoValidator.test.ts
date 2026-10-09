import { ValidationError } from '@shared/errors/DomainError';
import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { PhotoValidator } from '../domain/PhotoValidator';
import type { UploadedPhoto } from '../domain/types';

const validator = new PhotoValidator(config);

const SIGNATURE = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
} as const;

function photo(mimeType: keyof typeof SIGNATURE, bytes = 64): UploadedPhoto {
  const content = new Uint8Array(bytes);
  content.set(SIGNATURE[mimeType]);
  return { content, mimeType };
}

describe('PhotoValidator.check', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'] as const)(
    'UC-3 E2: accepts a %s under the limit',
    (type) => {
      expect(validator.check(photo(type))).toBeUndefined();
    },
  );

  it('UC-3 E2: accepts a photo of exactly 5 MB (boundary)', () => {
    expect(validator.check(photo('image/jpeg', 5 * 1024 * 1024))).toBeUndefined();
  });

  it('UC-3 E2: rejects a photo one byte over 5 MB', () => {
    expect(validator.check(photo('image/jpeg', 5 * 1024 * 1024 + 1))).toBe('PHOTO_TOO_LARGE');
  });

  it('UC-3 E2: rejects an empty photo', () => {
    expect(validator.check({ content: new Uint8Array(0), mimeType: 'image/jpeg' })).toBe(
      'PHOTO_EMPTY',
    );
  });

  it('UC-3 E2: rejects a type that is not JPEG, PNG or WebP', () => {
    expect(validator.check({ content: new Uint8Array(64), mimeType: 'image/gif' })).toBe(
      'PHOTO_TYPE',
    );
  });

  it('UC-3 E2: rejects a PNG whose bytes are really a JPEG', () => {
    const disguised = { ...photo('image/jpeg'), mimeType: 'image/png' };
    expect(validator.check(disguised)).toBe('PHOTO_UNREADABLE');
  });

  it('rejects a WebP that has the RIFF header but is not WebP', () => {
    const riffOnly = photo('image/webp');
    riffOnly.content.set([0x41, 0x56, 0x49, 0x20], 8);
    expect(validator.check(riffOnly)).toBe('PHOTO_UNREADABLE');
  });

  it('rejects a configured type that has no known file signature', () => {
    const custom = new PhotoValidator({ ...config, photoMimeTypes: ['image/avif'] });
    expect(custom.check({ content: new Uint8Array(64), mimeType: 'image/avif' })).toBe(
      'PHOTO_UNREADABLE',
    );
  });
});

describe('PhotoValidator.assertValid', () => {
  it('UC-3 E2: throws INVALID_PHOTO naming the problem', () => {
    const attempt = () =>
      validator.assertValid({ content: new Uint8Array(64), mimeType: 'image/gif' });
    expect(attempt).toThrow(ValidationError);
    try {
      attempt();
    } catch (error) {
      expect((error as ValidationError).code).toBe('INVALID_PHOTO');
      expect((error as ValidationError).fields).toEqual([{ field: 'photo', code: 'PHOTO_TYPE' }]);
    }
  });

  it('returns quietly for a valid photo', () => {
    expect(() => validator.assertValid(photo('image/png'))).not.toThrow();
  });
});

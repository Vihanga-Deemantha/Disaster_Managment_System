import { ValidationError } from '@shared/errors/DomainError';
import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import type { UploadedPhoto } from '../domain/types';

/**
 * UC-3 E2: an over-size or surplus file is an invalid photo. Anything else that fails while the
 * multipart body is read (a truncated or garbled request) is the client's malformed upload; the
 * parser has no server-side work that could fail.
 */
function toValidationError(error: unknown): ValidationError {
  if (error instanceof MulterError) {
    const code = error.code === 'LIMIT_FILE_SIZE' ? 'PHOTO_TOO_LARGE' : 'PHOTO_UNREADABLE';
    return new ValidationError(
      [{ field: 'photo', code }],
      'The photo could not be accepted.',
      'INVALID_PHOTO',
    );
  }
  return new ValidationError(
    [{ field: 'body', code: 'MALFORMED_UPLOAD' }],
    'The upload could not be read.',
    'MALFORMED_UPLOAD',
  );
}

/** One optional `photo` part, held in memory and cut off at the size limit. */
export function createPhotoUpload(maxBytes: number): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
  }).single('photo');
  return (req, res, next) => {
    parse(req, res, (error: unknown) => {
      // Multer reports success as `null` or `undefined` depending on the path taken.
      next(error ? toValidationError(error) : undefined);
    });
  };
}

export function uploadedPhotoOf(file: Express.Multer.File | undefined): UploadedPhoto | undefined {
  return file ? { content: new Uint8Array(file.buffer), mimeType: file.mimetype } : undefined;
}

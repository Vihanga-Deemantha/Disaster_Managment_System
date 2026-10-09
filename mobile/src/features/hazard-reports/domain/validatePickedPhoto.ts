import { PHOTO_MAX_BYTES } from './reportRules';
import type { PickedPhoto, PhotoToSend } from './types';

export type PhotoProblem = 'PHOTO_TYPE' | 'PHOTO_TOO_LARGE' | 'PHOTO_EMPTY';
export type PhotoValidation =
  { ok: true; photo: PhotoToSend } | { ok: false; problem: PhotoProblem };
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function inferredMime(photo: PickedPhoto): string {
  const name = (photo.fileName ?? photo.uri).split(/[?#]/)[0].toLowerCase();
  const extension = name.split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return '';
}

function sizeProblem(size: number | null | undefined): PhotoProblem | undefined {
  if (size === null || size === undefined) return undefined;
  if (!Number.isFinite(size) || size <= 0) return 'PHOTO_EMPTY';
  if (size > PHOTO_MAX_BYTES) return 'PHOTO_TOO_LARGE';
  return undefined;
}

export function validatePickedPhoto(picked: PickedPhoto): PhotoValidation {
  const mimeType = picked.mimeType?.toLowerCase() ?? inferredMime(picked);
  const extension = Object.hasOwn(extensions, mimeType) ? extensions[mimeType] : undefined;
  if (!extension || !picked.uri) return { ok: false, problem: 'PHOTO_TYPE' };
  const problem = sizeProblem(picked.fileSize);
  if (problem) return { ok: false, problem };
  return {
    ok: true,
    photo: { uri: picked.uri, name: `photo.${extension}`, mimeType, bytes: picked.fileSize ?? 0 },
  };
}

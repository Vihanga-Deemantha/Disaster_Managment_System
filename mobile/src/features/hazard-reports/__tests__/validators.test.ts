import { validatePickedPhoto } from '../domain/validatePickedPhoto';
import { validateReportDraft } from '../domain/validateReportDraft';
import { DESCRIPTION_MAX_CHARS, PHOTO_MAX_BYTES } from '../domain/reportRules';

const location = { lat: 6.5854, lng: 79.9607, source: 'GPS' as const, accuracyM: 15 };
const photo = { uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg', fileSize: 100 };

describe('UC-3 photo validation (E2)', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('accepts %s and uses a safe upload name', (mimeType, extension) => {
    expect(validatePickedPhoto({ ...photo, mimeType })).toEqual({
      ok: true,
      photo: { uri: photo.uri, name: `photo.${extension}`, mimeType, bytes: 100 },
    });
  });
  it('accepts exactly 5 MB and rejects one byte more', () => {
    expect(validatePickedPhoto({ ...photo, fileSize: PHOTO_MAX_BYTES }).ok).toBe(true);
    expect(validatePickedPhoto({ ...photo, fileSize: PHOTO_MAX_BYTES + 1 })).toEqual({
      ok: false,
      problem: 'PHOTO_TOO_LARGE',
    });
  });
  it.each([0, -1, NaN, Infinity])('rejects an empty or invalid size %s', (fileSize) => {
    expect(validatePickedPhoto({ ...photo, fileSize })).toEqual({
      ok: false,
      problem: 'PHOTO_EMPTY',
    });
  });
  it.each(['image/gif', 'image/heic'])(
    'rejects unsupported explicit %s even with a jpg filename',
    (mimeType) => {
      expect(validatePickedPhoto({ ...photo, mimeType })).toEqual({
        ok: false,
        problem: 'PHOTO_TYPE',
      });
    },
  );
  it.each([
    { uri: 'file:///cache/item', fileName: 'IMG_1.JPG' },
    { uri: 'file:///cache/item.png' },
    { uri: 'file:///cache/item.webp?download=1' },
  ])('infers missing MIME from name or URI: %s', (picked) =>
    expect(validatePickedPhoto(picked).ok).toBe(true),
  );
  it('normalizes MIME case and lets an unreported size reach the server', () => {
    expect(
      validatePickedPhoto({ uri: photo.uri, mimeType: 'IMAGE/JPEG', fileSize: null }),
    ).toMatchObject({ ok: true, photo: { bytes: 0 } });
  });
  it.each(['file:///cache/no-extension', 'file:///cache/file.gif', ''])(
    'refuses a photo with no supported type: %s',
    (uri) => {
      expect(validatePickedPhoto({ uri })).toEqual({ ok: false, problem: 'PHOTO_TYPE' });
    },
  );
});

describe('UC-3 draft validation', () => {
  it('accepts a complete draft and trims the description', () => {
    expect(
      validateReportDraft({
        hazardType: 'FLOOD',
        description: ' Water is rising ',
        location,
        photo,
      }),
    ).toMatchObject({
      ok: true,
      value: { description: 'Water is rising', photo: { name: 'photo.jpg' } },
    });
  });
  it.each(['FLOOD', 'LANDSLIDE', 'ROAD_BLOCKAGE', 'OTHER'] as const)(
    'accepts %s without an optional photo',
    (hazardType) => {
      expect(validateReportDraft({ hazardType, description: '', location }).ok).toBe(true);
    },
  );
  it('reports all missing fields and photo problems together', () => {
    expect(
      validateReportDraft({
        description: 'x'.repeat(501),
        photo: { ...photo, mimeType: 'image/gif' },
      }),
    ).toEqual({
      ok: false,
      problems: ['HAZARD_TYPE_REQUIRED', 'LOCATION_REQUIRED', 'DESCRIPTION_TOO_LONG', 'PHOTO_TYPE'],
    });
  });
  it('counts Unicode code points at the 500-character boundary', () => {
    expect(
      validateReportDraft({
        hazardType: 'OTHER',
        description: '🌧'.repeat(DESCRIPTION_MAX_CHARS),
        location,
      }).ok,
    ).toBe(true);
    expect(
      validateReportDraft({
        hazardType: 'OTHER',
        description: '🌧'.repeat(DESCRIPTION_MAX_CHARS + 1),
        location,
      }),
    ).toEqual({ ok: false, problems: ['DESCRIPTION_TOO_LONG'] });
  });
  it.each([NaN, Infinity, 100])('rejects invalid latitude %s', (lat) => {
    expect(
      validateReportDraft({ hazardType: 'FLOOD', description: '', location: { ...location, lat } }),
    ).toMatchObject({ ok: false, problems: ['LOCATION_INVALID'] });
  });
  it('rejects a point outside Sri Lanka', () => {
    expect(
      validateReportDraft({
        hazardType: 'FLOOD',
        description: '',
        location: { ...location, lat: 0, lng: 0 },
      }),
    ).toMatchObject({ ok: false, problems: ['LOCATION_OUTSIDE_SRI_LANKA'] });
  });
});

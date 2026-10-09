import { buildSubmitParts } from '../api/submitParts';
import { HttpReportUploader } from '../api/HttpReportUploader';
import { classifySubmitResponse } from '../offline/classifySubmitResponse';
import { aDraft } from '../testing/fakes';
import type { QueuedReport } from '../offline/types';

const entry: QueuedReport = {
  ...aDraft(),
  clientReportId: 'client-1',
  ownerId: 'user-1',
  capturedAt: '2026-10-09T03:00:00.000Z',
  state: 'QUEUED',
  attempts: 0,
};
describe('UC-3 steps 6–7: multipart report submission', () => {
  it('sends every capture field, optional accuracy, duplicate choice and the native file part', () => {
    expect(
      Object.fromEntries(
        buildSubmitParts(
          {
            ...entry,
            location: { ...entry.location, accuracyM: 0 },
            photo: {
              uri: 'file:///photo.jpg',
              name: 'photo.jpg',
              mimeType: 'image/jpeg',
              bytes: 100,
            },
          },
          { syncedFromOffline: true, duplicateAction: 'UPDATE' },
        ),
      ),
    ).toEqual({
      clientReportId: 'client-1',
      hazardType: 'FLOOD',
      description: 'Water rising',
      lat: '6.5854',
      lng: '79.9607',
      locationSource: 'GPS',
      capturedAt: entry.capturedAt,
      syncedFromOffline: 'true',
      accuracyM: '0',
      duplicateAction: 'UPDATE',
      photo: { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' },
    });
  });
  it('omits absent optional parts and never sends the owner identity as a form field', () => {
    const parts = Object.fromEntries(buildSubmitParts(entry, { syncedFromOffline: false }));
    expect(parts.syncedFromOffline).toBe('false');
    for (const field of ['accuracyM', 'duplicateAction', 'photo', 'ownerId'])
      expect(parts).not.toHaveProperty(field);
  });
  it.each(['CREATED', 'ALREADY_RECEIVED', 'UPDATED_EXISTING'])(
    'accepts only an acknowledged %s',
    (outcome) => {
      expect(classifySubmitResponse(201, { outcome, report: { id: 'report-1' } })).toEqual({
        kind: 'DELIVERED',
        via: outcome,
        reportId: 'report-1',
      });
    },
  );
  it.each([
    undefined,
    null,
    '<html>Wi-Fi login</html>',
    {},
    { outcome: 'UNKNOWN', report: { id: 'r' } },
    { outcome: 'CREATED' },
    { outcome: 'CREATED', report: { id: '' } },
  ])('does not acknowledge malformed success %p', (body) =>
    expect(classifySubmitResponse(200, body)).toEqual({ kind: 'RETRY' }),
  );
  it.each([408, 429, 500, 503])('retries transient HTTP %s', (status) =>
    expect(classifySubmitResponse(status, undefined)).toEqual({ kind: 'RETRY' }),
  );
  it('requires sign-in on 401', () =>
    expect(classifySubmitResponse(401, null)).toEqual({ kind: 'AUTH_REQUIRED' }));
  it('recognizes a duplicate only when it includes an existing report id', () => {
    expect(
      classifySubmitResponse(409, {
        error: { code: 'DUPLICATE_SUSPECTED', details: { existingReportId: 'r-1' } },
      }),
    ).toEqual({ kind: 'DUPLICATE_SUSPECTED', existingReportId: 'r-1' });
    expect(classifySubmitResponse(409, { error: { code: 'DUPLICATE_SUSPECTED' } })).toEqual({
      kind: 'RETRY',
    });
  });
  it('preserves a refusal code and safely handles malformed error bodies', () => {
    expect(
      classifySubmitResponse(400, { error: { code: 'INVALID_PHOTO', message: 'Invalid photo' } }),
    ).toEqual({ kind: 'REJECTED', code: 'INVALID_PHOTO', message: 'Invalid photo' });
    expect(classifySubmitResponse(403, { error: { code: 7, message: [] } })).toEqual({
      kind: 'REJECTED',
      code: 'HTTP_403',
      message: 'The report was refused.',
    });
    expect(classifySubmitResponse(409, undefined)).toEqual({
      kind: 'REJECTED',
      code: 'HTTP_409',
      message: 'The report was refused.',
    });
  });
  it('uploads built parts and classifies the API response without throwing on connection loss', async () => {
    let sent: unknown;
    const uploader = new HttpReportUploader(async (parts) => {
      sent = parts;
      return { status: 200, body: { outcome: 'ALREADY_RECEIVED', report: { id: 'r-1' } } };
    });
    expect(await uploader.upload(entry, { syncedFromOffline: false })).toMatchObject({
      kind: 'DELIVERED',
      reportId: 'r-1',
    });
    expect(sent).toEqual(buildSubmitParts(entry, { syncedFromOffline: false }));
    expect(
      await new HttpReportUploader(async () => {
        throw new Error('Offline');
      }).upload(entry, { syncedFromOffline: false }),
    ).toEqual({ kind: 'RETRY' });
  });
});

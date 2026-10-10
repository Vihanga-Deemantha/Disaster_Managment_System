import type { ValidationError } from '@shared/errors/DomainError';
import { parseOrThrow } from '@shared/errors/zod';
import type { z } from 'zod';
import {
  historyQuerySchema,
  queueQuerySchema,
  rejectSchema,
  submitReportSchema,
} from '../api/schemas';

const VALID = {
  clientReportId: 'client-0001',
  hazardType: 'FLOOD',
  description: 'Water is rising',
  lat: '6.5854',
  lng: '79.9607',
  locationSource: 'GPS',
  capturedAt: '2026-10-07T08:50:00.000Z',
};

/** Every `field:CODE` the schema reports for this input, or [] when it is valid. */
function problems(schema: z.ZodType, input: unknown): string[] {
  try {
    parseOrThrow(schema, input);
    return [];
  } catch (error) {
    return (error as ValidationError).fields.map(({ field, code }) => `${field}:${code}`);
  }
}

describe('submitReportSchema: valid input', () => {
  it('UC-3 step 7: turns multipart strings into numbers, a Date and defaults', () => {
    expect(parseOrThrow(submitReportSchema, VALID)).toEqual({
      clientReportId: 'client-0001',
      hazardType: 'FLOOD',
      description: 'Water is rising',
      lat: 6.5854,
      lng: 79.9607,
      locationSource: 'GPS',
      capturedAt: new Date('2026-10-07T08:50:00.000Z'),
      syncedFromOffline: false,
    });
  });

  it('accepts every optional field', () => {
    const parsed = parseOrThrow(submitReportSchema, {
      ...VALID,
      accuracyM: '12.5',
      duplicateAction: 'UPDATE',
      syncedFromOffline: 'true',
    });
    expect(parsed).toMatchObject({
      accuracyM: 12.5,
      duplicateAction: 'UPDATE',
      syncedFromOffline: true,
    });
  });

  it('a blank description is allowed and defaults to empty', () => {
    const { description: _ignored, ...withoutDescription } = VALID;
    expect(parseOrThrow(submitReportSchema, withoutDescription).description).toBe('');
  });

  it('a blank accuracy means "not reported", not zero', () => {
    expect(parseOrThrow(submitReportSchema, { ...VALID, accuracyM: '' }).accuracyM).toBeUndefined();
  });

  it('accepts a capture time with a UTC offset', () => {
    const parsed = parseOrThrow(submitReportSchema, {
      ...VALID,
      capturedAt: '2026-10-07T14:20:00+05:30',
    });
    expect(parsed.capturedAt).toEqual(new Date('2026-10-07T08:50:00.000Z'));
  });

  it('boundary: an 8-character clientReportId and a 500-character description are accepted', () => {
    const input = { ...VALID, clientReportId: 'abcd-123', description: 'x'.repeat(500) };
    expect(problems(submitReportSchema, input)).toEqual([]);
  });

  it('counts characters, not UTF-16 units: 500 emoji fit', () => {
    expect(problems(submitReportSchema, { ...VALID, description: '😀'.repeat(500) })).toEqual([]);
  });
});

describe('submitReportSchema: each rejection has a machine code', () => {
  it.each([
    [
      'clientReportId missing',
      { clientReportId: undefined },
      ['clientReportId:CLIENT_REPORT_ID_INVALID'],
    ],
    [
      'clientReportId too short',
      { clientReportId: 'abc-123' },
      ['clientReportId:CLIENT_REPORT_ID_INVALID'],
    ],
    [
      'clientReportId too long',
      { clientReportId: 'a'.repeat(65) },
      ['clientReportId:CLIENT_REPORT_ID_INVALID'],
    ],
    [
      'clientReportId with a space',
      { clientReportId: 'client 0001' },
      ['clientReportId:CLIENT_REPORT_ID_INVALID'],
    ],
    ['hazardType missing', { hazardType: undefined }, ['hazardType:HAZARD_TYPE_REQUIRED']],
    ['hazardType unknown', { hazardType: 'CYCLONE' }, ['hazardType:HAZARD_TYPE_REQUIRED']],
    [
      'description over 500',
      { description: 'x'.repeat(501) },
      ['description:DESCRIPTION_TOO_LONG'],
    ],
    ['lat missing', { lat: undefined }, ['lat:LOCATION_REQUIRED']],
    ['lat blank', { lat: '  ' }, ['lat:LOCATION_REQUIRED']],
    ['lat not a number', { lat: 'abc' }, ['lat:LOCATION_INVALID']],
    ['lat above 90', { lat: '91' }, ['lat:LOCATION_INVALID']],
    ['lng above 180', { lng: '181' }, ['lng:LOCATION_INVALID']],
    [
      'location outside Sri Lanka',
      { lat: '51.5', lng: '-0.12' },
      ['lat:LOCATION_OUTSIDE_SRI_LANKA'],
    ],
    [
      'locationSource unknown',
      { locationSource: 'GUESS' },
      ['locationSource:LOCATION_SOURCE_INVALID'],
    ],
    ['accuracy negative', { accuracyM: '-1' }, ['accuracyM:ACCURACY_INVALID']],
    ['accuracy not a number', { accuracyM: 'x' }, ['accuracyM:ACCURACY_INVALID']],
    ['capturedAt missing', { capturedAt: undefined }, ['capturedAt:CAPTURED_AT_INVALID']],
    ['capturedAt not a date', { capturedAt: 'yesterday' }, ['capturedAt:CAPTURED_AT_INVALID']],
    ['capturedAt date only', { capturedAt: '2026-10-07' }, ['capturedAt:CAPTURED_AT_INVALID']],
    [
      'duplicateAction unknown',
      { duplicateAction: 'MAYBE' },
      ['duplicateAction:DUPLICATE_ACTION_INVALID'],
    ],
    [
      'syncedFromOffline not a boolean word',
      { syncedFromOffline: 'yes' },
      ['syncedFromOffline:SYNCED_FLAG_INVALID'],
    ],
  ])('%s', (_label, override, expected) => {
    expect(problems(submitReportSchema, { ...VALID, ...override })).toEqual(expected);
  });

  it('lists every problem at once', () => {
    const input = { ...VALID, hazardType: undefined, lat: undefined, capturedAt: 'later' };
    expect(problems(submitReportSchema, input)).toEqual([
      'hazardType:HAZARD_TYPE_REQUIRED',
      'lat:LOCATION_REQUIRED',
      'capturedAt:CAPTURED_AT_INVALID',
    ]);
  });
});

describe('rejectSchema', () => {
  it('UC-3 A2: trims the reason', () => {
    expect(parseOrThrow(rejectSchema, { reason: '  Photo shows another place ' })).toEqual({
      reason: 'Photo shows another place',
    });
  });

  it.each([[{}], [{ reason: '' }], [{ reason: '   ' }]])(
    'UC-3 A2/H8: %j has no reason',
    (input) => {
      expect(problems(rejectSchema, input)).toEqual(['reason:REASON_REQUIRED']);
    },
  );

  it('boundary: 500 characters are accepted, 501 are not', () => {
    expect(problems(rejectSchema, { reason: 'x'.repeat(500) })).toEqual([]);
    expect(problems(rejectSchema, { reason: 'x'.repeat(501) })).toEqual(['reason:REASON_TOO_LONG']);
  });
});

describe('queueQuerySchema', () => {
  it('UC-3 step 11: defaults to the open and recommended clusters', () => {
    expect(parseOrThrow(queueQuerySchema, {}).status).toEqual(['OPEN', 'ESCALATION_RECOMMENDED']);
  });

  it('reads a comma-separated list', () => {
    expect(parseOrThrow(queueQuerySchema, { status: 'ESCALATED,CLOSED' }).status).toEqual([
      'ESCALATED',
      'CLOSED',
    ]);
  });

  it.each([['OPEN,BOGUS'], [''], ['open']])(
    'refuses %j instead of quietly ignoring it',
    (status) => {
      expect(problems(queueQuerySchema, { status })).toEqual(['status:STATUS_INVALID']);
    },
  );

  it('refuses a repeated parameter', () => {
    expect(problems(queueQuerySchema, { status: ['OPEN', 'CLOSED'] })).toEqual([
      'status:STATUS_INVALID',
    ]);
  });
});

describe('historyQuerySchema', () => {
  it('accepts no filter, a status, and a trimmed search text', () => {
    expect(parseOrThrow(historyQuerySchema, {})).toEqual({});
    expect(parseOrThrow(historyQuerySchema, { status: 'REJECTED', q: '  bridge ' })).toEqual({
      status: 'REJECTED',
      q: 'bridge',
    });
  });

  it('refuses an unknown status and a search text over 100 characters', () => {
    expect(problems(historyQuerySchema, { status: 'DONE' })).toEqual(['status:STATUS_INVALID']);
    expect(problems(historyQuerySchema, { q: 'x'.repeat(101) })).toEqual(['q:QUERY_TOO_LONG']);
  });
});

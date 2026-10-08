import type { z } from 'zod';
import { parseOrThrow, type ValidationError } from '@shared/errors';
import {
  channelParamSchema,
  gatewayModeSchema,
  issueSchema,
  listQuerySchema,
  rejectSchema,
  updateWarningSchema,
} from '../../api/schemas';
import { thrownBy } from '../../testing/builders';

/** The machine codes a screen would translate, one per offending field. */
const problemsOf = (schema: z.ZodType, input: unknown) => {
  const error = thrownBy(() => parseOrThrow(schema, input)) as ValidationError | undefined;
  return error?.fields ?? [];
};

describe('UC-1 step 1: listQuerySchema', () => {
  it('accepts no filter, and every real status', () => {
    expect(parseOrThrow(listQuerySchema, {})).toEqual({});
    for (const status of ['PENDING_APPROVAL', 'ISSUED', 'REJECTED']) {
      expect(parseOrThrow(listQuerySchema, { status })).toEqual({ status });
    }
  });

  it('refuses a status that does not exist', () => {
    expect(problemsOf(listQuerySchema, { status: 'DONE' })).toEqual([
      { field: 'status', code: 'STATUS_INVALID' },
    ]);
  });
});

describe('UC-1 A2: updateWarningSchema', () => {
  it('accepts an edit that changes nothing, since every field is optional', () => {
    expect(parseOrThrow(updateWarningSchema, {})).toEqual({});
  });

  it('turns dates into Date objects and keeps text as it was typed', () => {
    const parsed = parseOrThrow(updateWarningSchema, {
      expectedVersion: 3,
      severity: 'CRITICAL',
      messages: { EN: '  keep my spaces  ', SI: '' },
      validFrom: '2026-10-07T09:00:00.000Z',
      validTo: '2026-10-08T09:00:00+05:30',
    });

    expect(parsed).toEqual({
      expectedVersion: 3,
      severity: 'CRITICAL',
      messages: { EN: '  keep my spaces  ', SI: '' },
      validFrom: new Date('2026-10-07T09:00:00.000Z'),
      validTo: new Date('2026-10-08T03:30:00.000Z'),
    });
  });

  it('quietly drops fields it does not know, so a request cannot smuggle in status or approver', () => {
    const parsed = parseOrThrow(updateWarningSchema, {
      severity: 'LOW',
      status: 'ISSUED',
      approvedBy: 'me',
      messages: { EN: 'x', FR: 'y' },
    });

    expect(parsed).toEqual({ severity: 'LOW', messages: { EN: 'x' } });
  });

  it.each([0, -1, 1.5, '2', null])('refuses %j as a version', (expectedVersion) => {
    expect(problemsOf(updateWarningSchema, { expectedVersion })).toEqual([
      { field: 'expectedVersion', code: 'VERSION_INVALID' },
    ]);
  });

  it('names every bad field at once, so the screen can mark them all', () => {
    const problems = problemsOf(updateWarningSchema, {
      severity: 'EXTREME',
      validFrom: 'tomorrow-ish',
      validTo: 12,
      messages: { EN: 5, TA: 'x'.repeat(2001) },
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        { field: 'severity', code: 'SEVERITY_INVALID' },
        { field: 'validFrom', code: 'DATE_INVALID' },
        { field: 'validTo', code: 'DATE_INVALID' },
        { field: 'messages.EN', code: 'MESSAGE_INVALID' },
        { field: 'messages.TA', code: 'MESSAGE_TOO_LONG' },
      ]),
    );
    expect(problems).toHaveLength(5);
  });

  it('lets a draft carry a message longer than an SMS, because the 160 rule is checked when issuing', () => {
    expect(
      parseOrThrow(updateWarningSchema, { messages: { EN: 'x'.repeat(2000) } }).messages?.EN,
    ).toHaveLength(2000);
  });
});

describe('UC-1 A3: rejectSchema', () => {
  it('accepts a reason and trims it', () => {
    expect(parseOrThrow(rejectSchema, { reason: '  Duplicate of W-9 ' })).toEqual({
      reason: 'Duplicate of W-9',
    });
  });

  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 7 }, { reason: null }])(
    'insists on a reason: %j is not one',
    (body) => {
      expect(problemsOf(rejectSchema, body)).toEqual([
        { field: 'reason', code: 'REASON_REQUIRED' },
      ]);
    },
  );

  it('keeps a reason to a sensible length', () => {
    expect(parseOrThrow(rejectSchema, { reason: 'x'.repeat(500) }).reason).toHaveLength(500);
    expect(problemsOf(rejectSchema, { reason: 'x'.repeat(501) })).toEqual([
      { field: 'reason', code: 'REASON_TOO_LONG' },
    ]);
  });
});

describe('UC-1 step 11: issueSchema', () => {
  it('sends on no optional channel unless told to', () => {
    expect(parseOrThrow(issueSchema, {})).toEqual({ optionalChannels: [] });
  });

  it('accepts WhatsApp and e-mail, singly or together', () => {
    expect(parseOrThrow(issueSchema, { optionalChannels: ['EMAIL'] }).optionalChannels).toEqual([
      'EMAIL',
    ]);
    expect(
      parseOrThrow(issueSchema, { optionalChannels: ['WHATSAPP', 'EMAIL'] }).optionalChannels,
    ).toEqual(['WHATSAPP', 'EMAIL']);
  });

  it('refuses to "switch on" push or SMS, which always go, and names which entry is wrong', () => {
    expect(problemsOf(issueSchema, { optionalChannels: ['EMAIL', 'PUSH', 'FAX'] })).toEqual([
      { field: 'optionalChannels.1', code: 'CHANNEL_INVALID' },
      { field: 'optionalChannels.2', code: 'CHANNEL_INVALID' },
    ]);
  });
});

describe('the demo gateway toggles: channelParamSchema and gatewayModeSchema', () => {
  it('knows the four channels', () => {
    for (const channel of ['PUSH', 'SMS', 'WHATSAPP', 'EMAIL']) {
      expect(parseOrThrow(channelParamSchema, channel)).toBe(channel);
    }
    expect(problemsOf(channelParamSchema, 'FAX')).toEqual([{ field: '', code: 'CHANNEL_INVALID' }]);
  });

  it('knows the three modes', () => {
    for (const mode of ['OK', 'FAIL_SOME', 'DOWN']) {
      expect(parseOrThrow(gatewayModeSchema, { mode })).toEqual({ mode });
    }
    expect(problemsOf(gatewayModeSchema, { mode: 'BROKEN' })).toEqual([
      { field: 'mode', code: 'MODE_INVALID' },
    ]);
    expect(problemsOf(gatewayModeSchema, {})).toEqual([{ field: 'mode', code: 'MODE_INVALID' }]);
  });
});

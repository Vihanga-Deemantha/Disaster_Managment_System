import { en } from '@/shared/i18n/messages.en';
import { interpolate, type Translate } from '@/shared/i18n/I18nProvider';
import {
  SMS_MAX_LENGTH,
  areaNames,
  describeIssue,
  formatDateTime,
  fromLocalInput,
  hasRetryableDelivery,
  hazardCounts,
  missingLanguages,
  oldestSubmittedAt,
  reachedPercent,
  smsLength,
  toLocalInput,
  urgentCount,
} from '../format';
import { aBasin, aDistrict, aResult, aWarning } from '../testing/fixtures';

const t: Translate = (key, params) => interpolate(en[key], params);

describe('UC-1 SC1-05: smsLength (the 160-character rule)', () => {
  it('counts the characters a person sees, not the bytes', () => {
    expect(smsLength('Flood')).toBe(5);
    expect(smsLength('ගංවතුර')).toBe(6);
    expect(smsLength('🌊🌊')).toBe(2);
  });

  it('ignores the spaces around the text, like the server', () => {
    expect(smsLength('  Flood \n')).toBe(5);
    expect(smsLength('   ')).toBe(0);
  });

  it('allows exactly 160', () => {
    expect(SMS_MAX_LENGTH).toBe(160);
    expect(smsLength('x'.repeat(160))).toBe(160);
  });
});

describe('UC-1 HCI-06a: missingLanguages', () => {
  const full = { SI: 'සිංහල', TA: 'தமிழ்', EN: 'English' };

  it('lists the languages with no text, in the usual order', () => {
    expect(missingLanguages({ ...full, TA: '' })).toEqual(['TA']);
    expect(missingLanguages({ SI: '', TA: '  ', EN: 'x' })).toEqual(['SI', 'TA']);
  });

  it('is empty when every language has text', () => {
    expect(missingLanguages(full)).toEqual([]);
  });
});

describe('UC-1 HCI-05a: reachedPercent', () => {
  it('is zero when nobody was targeted, rather than dividing by zero', () => {
    expect(reachedPercent(aResult({ targeted: 0, reached: 0 }))).toBe(0);
  });

  it('is exact when it divides evenly', () => {
    expect(reachedPercent(aResult({ targeted: 4, reached: 3 }))).toBe(75);
    expect(reachedPercent(aResult({ targeted: 61, reached: 61 }))).toBe(100);
  });

  it('rounds down, so 100% only ever means everyone', () => {
    expect(reachedPercent(aResult({ targeted: 1000, reached: 999 }))).toBe(99);
    expect(reachedPercent(aResult({ targeted: 3, reached: 2 }))).toBe(66);
  });
});

describe('UC-1 A1/E2: hasRetryableDelivery', () => {
  it('is false when everything was delivered', () => {
    expect(hasRetryableDelivery(aResult())).toBe(false);
  });

  it('is true when citizens are waiting for an automatic retry', () => {
    expect(hasRetryableDelivery(aResult({ pendingRetry: 2 }))).toBe(true);
  });

  it('is true when citizens failed outright', () => {
    expect(hasRetryableDelivery(aResult({ failed: 1 }))).toBe(true);
  });

  it('is true when one channel failed even though the citizen was reached another way', () => {
    const result = aResult();
    result.byChannel.PUSH.failed = 3;

    expect(hasRetryableDelivery(result)).toBe(true);
  });
});

describe('UC-1 step 1: the Pending Approvals helpers', () => {
  const list = [
    aWarning({ warningId: 'a', hazardType: 'LANDSLIDE', severity: 'CRITICAL' }),
    aWarning({ warningId: 'b', hazardType: 'FLOOD', severity: 'HIGH' }),
    aWarning({ warningId: 'c', hazardType: 'FLOOD', severity: 'LOW' }),
  ];

  it('hazardCounts lists only the hazards present, in the app’s order', () => {
    expect(hazardCounts(list)).toEqual([
      ['FLOOD', 2],
      ['LANDSLIDE', 1],
    ]);
    expect(hazardCounts([])).toEqual([]);
  });

  it('urgentCount counts critical and high, and nothing below', () => {
    expect(urgentCount(list)).toBe(2);
    expect(urgentCount([aWarning({ severity: 'MEDIUM' })])).toBe(0);
  });

  it('oldestSubmittedAt is when the longest-waiting one came in', () => {
    const older = aWarning({ submittedAt: '2026-10-07T07:00:00.000Z' });
    const newer = aWarning({ submittedAt: '2026-10-07T09:00:00.000Z' });

    expect(oldestSubmittedAt([newer, older])).toBe(Date.parse('2026-10-07T07:00:00.000Z'));
  });

  it('areaNames joins every area of a warning', () => {
    expect(areaNames(aWarning({ targetAreas: [aDistrict(), aBasin()] }))).toBe(
      'Gampaha, Kelani Ganga basin',
    );
    expect(areaNames(aWarning({ targetAreas: [] }))).toBe('');
  });
});

describe('UC-1 A2: the date boxes', () => {
  it('formatDateTime writes a date and time in the language’s own style', () => {
    for (const language of ['EN', 'SI', 'TA'] as const) {
      expect(formatDateTime('2026-10-07T09:00:00.000Z', language)).toMatch(/2026/);
    }
  });

  it('toLocalInput shows the officer’s own clock, to the minute, with leading zeros', () => {
    const iso = new Date(2026, 0, 5, 7, 3, 45).toISOString();

    expect(toLocalInput(iso)).toBe('2026-01-05T07:03');
  });

  it('fromLocalInput turns the box back into the ISO text the API takes', () => {
    const typed = '2026-01-05T07:03';

    expect(fromLocalInput(typed)).toBe(new Date(2026, 0, 5, 7, 3).toISOString());
    expect(toLocalInput(fromLocalInput(typed))).toBe(typed);
  });
});

describe('UC-1 E1: describeIssue', () => {
  it('names the language when the problem is about one', () => {
    expect(describeIssue(t, { field: 'messages.TA', code: 'MESSAGE_REQUIRED' })).toBe(
      'Write the warning text in தமிழ்.',
    );
    expect(describeIssue(t, { field: 'messages.EN', code: 'SMS_TOO_LONG' })).toBe(
      'The English text must fit one SMS (160 characters).',
    );
  });

  it('is a plain sentence when the problem is about something else', () => {
    expect(describeIssue(t, { field: 'validTo', code: 'VALIDITY_EXPIRED' })).toBe(
      'The warning has already expired. Move its end time forward.',
    );
  });

  it('falls back to a general message for a code it has no sentence for', () => {
    expect(describeIssue(t, { field: 'x', code: 'SOMETHING_NEW' })).toBe(en['error.UNKNOWN']);
  });
});

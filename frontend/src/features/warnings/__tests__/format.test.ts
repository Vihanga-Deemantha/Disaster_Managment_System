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
  searchText,
  smsLength,
  submittedTodayCount,
  submitterCount,
  submitterLabel,
  toLocalInput,
  urgentCount,
  waitingOverADay,
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

describe('UC-1 step 1: the numbers on the four cards', () => {
  /** Midday, local time, so "today" and "yesterday" below do not depend on when the test runs. */
  const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime();
  const at = (hours: number): string => new Date(NOW - hours * 3_600_000).toISOString();

  it('submittedTodayCount counts the warnings that came in on the officer’s own calendar day', () => {
    const list = [
      aWarning({ submittedAt: at(1) }),
      aWarning({ submittedAt: at(11.5) }),
      aWarning({ submittedAt: at(12.5) }),
      aWarning({ submittedAt: at(40) }),
    ];

    expect(submittedTodayCount(list, NOW)).toBe(2);
    expect(submittedTodayCount([], NOW)).toBe(0);
  });

  it('waitingOverADay counts only those that have waited more than 24 hours', () => {
    const list = [
      aWarning({ submittedAt: at(1) }),
      aWarning({ submittedAt: at(24) }),
      aWarning({ submittedAt: at(24.01) }),
      aWarning({ submittedAt: at(72) }),
    ];

    expect(waitingOverADay(list, NOW)).toBe(2);
  });

  it('submitterCount is how many different people sent them', () => {
    const list = [
      aWarning({ submittedBy: 'u1' }),
      aWarning({ submittedBy: 'u2' }),
      aWarning({ submittedBy: 'u1' }),
    ];

    expect(submitterCount(list)).toBe(2);
    expect(submitterCount([])).toBe(0);
  });
});

describe('UC-1 step 1: who sent it, and what a search can find', () => {
  it('submitterLabel prefers the name saved with the warning', () => {
    const warning = aWarning({ submittedByName: 'Nimali Perera', sourceClusterId: 'CL-1' });

    expect(submitterLabel(warning, t)).toBe('Nimali Perera');
  });

  it('submitterLabel says Duty Officer for a draft confirmed from a UC-3 cluster, which carries no name', () => {
    expect(submitterLabel(aWarning({ sourceClusterId: 'CL-1' }), t)).toBe('Duty Officer');
  });

  it('submitterLabel falls back to the id rather than showing nothing', () => {
    expect(submitterLabel(aWarning({ submittedBy: 'usr-duty-9' }), t)).toBe('usr-duty-9');
  });

  it('searchText is one lower-case line of the hazard, places, sender, id and rejection reason', () => {
    const warning = aWarning({
      warningId: 'W-77',
      hazardType: 'LANDSLIDE',
      targetAreas: [aDistrict(), aBasin()],
      submittedByName: 'Nimali Perera',
      rejectionReason: 'Duplicate of W-9',
    });

    expect(searchText(warning, t)).toBe(
      'landslide gampaha, kelani ganga basin nimali perera w-77 duplicate of w-9',
    );
  });

  it('searchText has no stray text for a warning that was not rejected', () => {
    expect(searchText(aWarning({ warningId: 'W-1' }), t)).toBe('flood gampaha usr-duty-1 w-1 ');
  });
});

describe('UC-1 A2: the date boxes', () => {
  it('formatDateTime writes a date and time in the language’s own style', () => {
    for (const language of ['EN', 'SI', 'TA'] as const) {
      expect(formatDateTime('2026-10-07T09:00:00.000Z', language)).toMatch(/2026/);
    }
  });

  it('formatDateTime writes English day first with a 24-hour clock, as people in Sri Lanka do', () => {
    const iso = new Date(2026, 9, 7, 14, 5).toISOString();

    expect(formatDateTime(iso, 'EN')).toBe('7 Oct 2026, 14:05');
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

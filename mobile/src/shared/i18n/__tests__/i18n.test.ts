import { ApiError, NetworkError } from '@/shared/api/errors';
import { DISTRICTS, HAZARD_TYPES, LANGUAGES, SEVERITIES } from '@/shared/contracts/enums';
import { RoleNotAllowedError } from '@/shared/session/SessionController';
import { deviceOffsetMinutes, formatClock, formatWhen, localParts } from '../formatWhen';
import { districtLabel, hazardLabel, severityLabel } from '../labels';
import { en } from '../messages.en';
import { si } from '../messages.si';
import { ta } from '../messages.ta';
import { isMessageKey, translate, translatorFor } from '../translate';
import { translateCode, translateError } from '../translateError';

const COLOMBO = 330;
const tEn = translatorFor('EN');

describe('the catalogs', () => {
  it('have the same keys in English, Sinhala and Tamil', () => {
    expect(Object.keys(si).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ta).sort()).toEqual(Object.keys(en).sort());
  });

  it('keep every placeholder in every language', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(si[key])).toEqual(placeholders(en[key]));
      expect(placeholders(ta[key])).toEqual(placeholders(en[key]));
    }
  });

  it('never leave a text empty', () => {
    for (const catalog of [en, si, ta]) {
      for (const value of Object.values(catalog)) expect(value.trim()).not.toBe('');
    }
  });

  it('name every district, hazard and severity the API can send', () => {
    for (const district of DISTRICTS) expect(isMessageKey(`district.${district}`)).toBe(true);
    for (const hazard of HAZARD_TYPES) expect(isMessageKey(`hazard.${hazard}`)).toBe(true);
    for (const severity of SEVERITIES) expect(isMessageKey(`severity.${severity}`)).toBe(true);
  });
});

describe('translate', () => {
  it('speaks each language', () => {
    expect(translate('EN', 'auth.login.title')).toBe('Sign in');
    expect(translate('SI', 'auth.login.title')).toBe(si['auth.login.title']);
    expect(translate('TA', 'auth.login.title')).toBe(ta['auth.login.title']);
    expect(si['auth.login.title']).not.toBe(en['auth.login.title']);
  });

  it('fills placeholders, leaves unknown ones, and writes numbers', () => {
    expect(translate('EN', 'alerts.updated', { time: '10:42' })).toBe('Updated 10:42');
    expect(translate('EN', 'alerts.updated', {})).toBe('Updated {time}');
    expect(translate('EN', 'alerts.unreadCount', { count: 3 })).toBe('3 unread');
    expect(translate('SI', 'auth.account.signedInAs', { name: 'නිමලි' })).toContain('නිමලි');
  });

  it('translatorFor fixes the language', () => {
    expect(translatorFor('TA')('lang.label')).toBe(ta['lang.label']);
  });

  it('isMessageKey tells a text from anything else', () => {
    expect(isMessageKey('app.name')).toBe(true);
    expect(isMessageKey('error.NOPE')).toBe(false);
    expect(isMessageKey('toString')).toBe(false);
  });
});

describe('translateError', () => {
  it('says offline for a network failure', () => {
    expect(translateError(tEn, new NetworkError())).toBe(en['error.NETWORK']);
  });

  it('uses the code of an API error', () => {
    expect(translateError(tEn, new ApiError(401, 'INVALID_CREDENTIALS', 'x'))).toBe(
      en['error.INVALID_CREDENTIALS'],
    );
  });

  it('says how long to wait when the server throttled the sign-in', () => {
    const throttled = new ApiError(429, 'LOGIN_THROTTLED', 'x', { retryAfterSeconds: 42 });

    expect(translateError(tEn, throttled)).toBe(
      'Too many attempts. Please wait 42 seconds and try again.',
    );
  });

  it('explains why an officer cannot use the app', () => {
    expect(translateError(tEn, new RoleNotAllowedError())).toBe(en['error.ROLE_NOT_ALLOWED']);
  });

  it('falls back to a plain sentence for a code it has no text for, and for anything else', () => {
    expect(translateError(tEn, new ApiError(500, 'SOMETHING_NEW', 'x'))).toBe(en['error.UNKNOWN']);
    expect(translateError(tEn, new Error('boom'))).toBe(en['error.UNKNOWN']);
    expect(translateError(tEn, undefined)).toBe(en['error.UNKNOWN']);
    expect(translateCode(tEn, 'PHONE_INVALID')).toBe(en['error.PHONE_INVALID']);
    expect(translateCode(tEn, 'NOPE')).toBe(en['error.UNKNOWN']);
  });
});

describe('labels', () => {
  it('names a district in the reader’s language, with the English name beside Sinhala and Tamil', () => {
    expect(districtLabel(translatorFor('EN'), 'EN', 'COLOMBO')).toBe('Colombo');
    expect(districtLabel(translatorFor('SI'), 'SI', 'COLOMBO')).toBe('කොළඹ (Colombo)');
    expect(districtLabel(translatorFor('TA'), 'TA', 'NUWARA_ELIYA')).toBe(
      'நுவரெலியா (Nuwara Eliya)',
    );
  });

  it('names a hazard and a severity', () => {
    expect(hazardLabel(tEn, 'LANDSLIDE')).toBe('Landslide');
    expect(severityLabel(translatorFor('SI'), 'CRITICAL')).toBe(si['severity.CRITICAL']);
  });

  it('names every district in every language', () => {
    for (const language of LANGUAGES) {
      for (const district of DISTRICTS) {
        expect(districtLabel(translatorFor(language), language, district).trim()).not.toBe('');
      }
    }
  });
});

describe('formatWhen', () => {
  // 08:30 UTC on 8 Oct 2026 is 14:00 in Colombo.
  const now = new Date('2026-10-08T08:30:00.000Z');

  it('splits an instant into the parts a person would read in their own zone', () => {
    expect(localParts(new Date('2026-12-31T20:00:00.000Z'), COLOMBO)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
      hours: 1,
      minutes: 30,
    });
    expect(localParts(new Date('2026-01-01T02:00:00.000Z'), -300)).toMatchObject({
      year: 2025,
      month: 12,
      day: 31,
      hours: 21,
    });
  });

  it('writes the clock with two digits', () => {
    expect(formatClock(new Date('2026-10-08T03:35:00.000Z'), COLOMBO)).toBe('09:05');
    expect(formatClock(new Date('2026-10-08T18:30:00.000Z'), COLOMBO)).toBe('00:00');
  });

  it('says Today and Yesterday by the calendar day in the person’s zone, not by 24 hours', () => {
    const justAfterMidnight = new Date('2026-10-07T18:45:00.000Z');
    expect(formatWhen(justAfterMidnight, now, tEn, COLOMBO)).toBe('Today, 00:15');
    const lateYesterday = new Date('2026-10-07T17:00:00.000Z');
    expect(formatWhen(lateYesterday, now, tEn, COLOMBO)).toBe('Yesterday, 22:30');
  });

  it('gives the date for anything older, and the year only when it is another year', () => {
    expect(formatWhen(new Date('2026-10-05T04:00:00.000Z'), now, tEn, COLOMBO)).toBe(
      '5 Oct, 09:30',
    );
    expect(formatWhen(new Date('2025-12-31T10:00:00.000Z'), now, tEn, COLOMBO)).toBe(
      '31 Dec 2025, 15:30',
    );
  });

  it('writes the month in Sinhala and Tamil', () => {
    const then = new Date('2026-10-05T04:00:00.000Z');
    expect(formatWhen(then, now, translatorFor('SI'), COLOMBO)).toBe(`5 ${si['month.10']}, 09:30`);
    expect(formatWhen(then, now, translatorFor('TA'), COLOMBO)).toBe(`5 ${ta['month.10']}, 09:30`);
  });

  it('reads the offset of this phone for a given instant', () => {
    const date = new Date('2026-10-08T08:30:00.000Z');
    expect(deviceOffsetMinutes(date)).toBe(-date.getTimezoneOffset());
  });
});

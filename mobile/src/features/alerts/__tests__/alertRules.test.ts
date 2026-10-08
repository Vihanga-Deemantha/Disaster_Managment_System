import { BANNER_BODY_LENGTH, notificationContent } from '../domain/notificationText';
import { parseAlert, parseInbox } from '../domain/parseInbox';
import { clockSkewMs, newestFirst, serverNowMs, validityAt } from '../domain/validity';
import { en } from '@/shared/i18n/messages.en';
import { si } from '@/shared/i18n/messages.si';
import { ta } from '@/shared/i18n/messages.ta';
import { anAlert, at, HOUR, NOW } from '../testing/fakes';

/** What the API sends for one alert. */
const wire = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  alertId: 'N-1',
  warningId: 'W-1',
  hazardType: 'FLOOD',
  severity: 'HIGH',
  message: 'Flood warning for Gampaha.',
  language: 'EN',
  areas: [{ areaId: 'GAMPAHA', type: 'DISTRICT', name: 'Gampaha', district: 'GAMPAHA' }],
  validFrom: '2026-10-08T09:00:00.000Z',
  validTo: '2026-10-09T09:00:00.000Z',
  deliveredAt: '2026-10-08T09:00:05.000Z',
  ...overrides,
});

describe('parseAlert', () => {
  it('reads a complete alert exactly as the API describes it', () => {
    expect(parseAlert(wire())).toEqual({
      alertId: 'N-1',
      warningId: 'W-1',
      hazardType: 'FLOOD',
      severity: 'HIGH',
      message: 'Flood warning for Gampaha.',
      language: 'EN',
      areas: [{ areaId: 'GAMPAHA', type: 'DISTRICT', name: 'Gampaha', district: 'GAMPAHA' }],
      validFrom: '2026-10-08T09:00:00.000Z',
      validTo: '2026-10-09T09:00:00.000Z',
      deliveredAt: '2026-10-08T09:00:05.000Z',
    });
  });

  it.each([
    ['not an object', 'text'],
    ['null', null],
    ['an array', []],
    ['no id', wire({ alertId: undefined })],
    ['an empty id', wire({ alertId: '  ' })],
    ['no message', wire({ message: undefined })],
    ['an empty message', wire({ message: '' })],
    ['no start', wire({ validFrom: undefined })],
    ['a start that is not a date', wire({ validFrom: 'soon' })],
    ['no end', wire({ validTo: undefined })],
    ['an end that is not a date', wire({ validTo: 42 })],
    ['no delivery time', wire({ deliveredAt: undefined })],
    ['a delivery time that is not a date', wire({ deliveredAt: 'yesterday-ish' })],
  ])('cannot show %s, so it is left out', (_label, value) => {
    expect(parseAlert(value)).toBeUndefined();
  });

  it('still shows an alert whose decoration it does not understand', () => {
    const alert = parseAlert(
      wire({ severity: 'EXTREME', hazardType: 'METEOR', language: 'FR', warningId: undefined }),
    );

    expect(alert).toMatchObject({
      severity: 'HIGH',
      hazardType: 'OTHER',
      language: 'EN',
      warningId: 'N-1',
    });
  });

  it.each(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])('keeps the severity %s', (severity) => {
    expect(parseAlert(wire({ severity }))?.severity).toBe(severity);
  });

  it.each(['SI', 'TA', 'EN'])('keeps the language %s', (language) => {
    expect(parseAlert(wire({ language }))?.language).toBe(language);
  });

  it('keeps the areas it can read and drops the ones it cannot', () => {
    const alert = parseAlert(
      wire({
        areas: [
          { areaId: 'KELANI', type: 'RIVER_BASIN', name: 'Kelani Ganga', district: 'COLOMBO' },
          { areaId: 'X' },
          'nonsense',
          null,
          { areaId: 'KALUTARA', name: 'Kalutara', type: 'WEIRD', district: 'ATLANTIS' },
        ],
      }),
    );

    expect(alert?.areas).toEqual([
      { areaId: 'KELANI', type: 'RIVER_BASIN', name: 'Kelani Ganga', district: 'COLOMBO' },
      { areaId: 'KALUTARA', type: 'DISTRICT', name: 'Kalutara' },
    ]);
  });

  it('copes with areas that are missing or not a list', () => {
    expect(parseAlert(wire({ areas: undefined }))?.areas).toEqual([]);
    expect(parseAlert(wire({ areas: 'Gampaha' }))?.areas).toEqual([]);
  });
});

describe('parseInbox', () => {
  it('reads the list and the server time', () => {
    const inbox = parseInbox({
      alerts: [wire(), wire({ alertId: 'N-2' })],
      serverTime: '2026-10-08T09:01:00.000Z',
    });

    expect(inbox?.alerts.map((alert) => alert.alertId)).toEqual(['N-1', 'N-2']);
    expect(inbox?.serverTime).toBe('2026-10-08T09:01:00.000Z');
  });

  it('keeps the good alerts when some are damaged', () => {
    const inbox = parseInbox({ alerts: [wire(), { nonsense: true }, wire({ alertId: 'N-3' })] });

    expect(inbox?.alerts.map((alert) => alert.alertId)).toEqual(['N-1', 'N-3']);
  });

  it('has no server time when the server did not give a usable one', () => {
    expect(parseInbox({ alerts: [] })).toEqual({ alerts: [] });
    expect(parseInbox({ alerts: [], serverTime: 'now' })).toEqual({ alerts: [] });
    expect(parseInbox({ alerts: [], serverTime: 12 })).toEqual({ alerts: [] });
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['text', 'ok'],
    ['an array', []],
    ['an object without alerts', { serverTime: '2026-10-08T09:00:00.000Z' }],
    ['alerts that are not a list', { alerts: {} }],
  ])('says it is not an inbox for %s', (_label, body) => {
    expect(parseInbox(body)).toBeUndefined();
  });
});

describe('validityAt', () => {
  const alert = { validFrom: at(HOUR), validTo: at(3 * HOUR) };
  const ms = (offset: number) => NOW.getTime() + offset;

  it('is upcoming before the start, active from the start, expired from the end', () => {
    expect(validityAt(alert, ms(HOUR - 1))).toBe('upcoming');
    expect(validityAt(alert, ms(HOUR))).toBe('active');
    expect(validityAt(alert, ms(3 * HOUR - 1))).toBe('active');
    expect(validityAt(alert, ms(3 * HOUR))).toBe('expired');
    expect(validityAt(alert, ms(10 * HOUR))).toBe('expired');
  });
});

describe('the server’s clock', () => {
  it('moves the phone’s time by the skew', () => {
    expect(serverNowMs(1_000, 250)).toBe(1_250);
    expect(serverNowMs(1_000, -250)).toBe(750);
  });

  it('is how far the server was ahead (+) or behind (-) the phone, and nothing when it did not say', () => {
    expect(clockSkewMs(at(HOUR), NOW.getTime())).toBe(HOUR);
    expect(clockSkewMs(at(-HOUR), NOW.getTime())).toBe(-HOUR);
    expect(clockSkewMs(undefined, NOW.getTime())).toBe(0);
  });
});

describe('newestFirst', () => {
  it('sorts by delivery time, newest first, and by id when it is the same', () => {
    const list = [
      anAlert({ alertId: 'b', deliveredAt: at(0) }),
      anAlert({ alertId: 'new', deliveredAt: at(HOUR) }),
      anAlert({ alertId: 'a', deliveredAt: at(0) }),
      anAlert({ alertId: 'old', deliveredAt: at(-HOUR) }),
    ];

    expect(list.sort(newestFirst).map((alert) => alert.alertId)).toEqual(['new', 'a', 'b', 'old']);
  });
});

describe('notificationContent', () => {
  it('writes the title in the alert’s own language, then the message', () => {
    const content = notificationContent(anAlert({ hazardType: 'LANDSLIDE', severity: 'CRITICAL' }));

    expect(content.title).toBe('Landslide warning · Critical');
    expect(content.body).toBe(anAlert().message);
    expect(content.data).toEqual({ alertId: 'A-1' });
  });

  it('is in Sinhala for a Sinhala alert, and in Tamil for a Tamil one', () => {
    const sinhala = notificationContent(
      anAlert({ language: 'SI', hazardType: 'FLOOD', severity: 'HIGH' }),
    );
    const tamil = notificationContent(
      anAlert({ language: 'TA', hazardType: 'FLOOD', severity: 'HIGH' }),
    );

    expect(sinhala.title).toBe(`${si['hazard.FLOOD']} අනතුරු ඇඟවීම · ${si['severity.HIGH']}`);
    expect(tamil.title).toBe(`${ta['hazard.FLOOD']} எச்சரிக்கை · ${ta['severity.HIGH']}`);
  });

  it('calls a hazard it does not know a plain hazard', () => {
    expect(notificationContent(anAlert({ hazardType: 'OTHER' })).title).toBe(
      `${en['hazard.OTHER']} warning · ${en['severity.HIGH']}`,
    );
  });

  it('keeps a short message whole, trimmed', () => {
    expect(notificationContent(anAlert({ message: '  Move now.  ' })).body).toBe('Move now.');
  });

  it('shortens a long message to the banner length, with an ellipsis', () => {
    const body = notificationContent(
      anAlert({ message: 'x'.repeat(BANNER_BODY_LENGTH + 50) }),
    ).body;

    expect([...body]).toHaveLength(BANNER_BODY_LENGTH);
    expect(body.endsWith('…')).toBe(true);
  });

  it('does not cut a message of exactly the banner length', () => {
    const message = 'y'.repeat(BANNER_BODY_LENGTH);

    expect(notificationContent(anAlert({ message })).body).toBe(message);
  });

  it('counts a Sinhala message in whole characters, never splitting one', () => {
    const body = notificationContent(anAlert({ language: 'SI', message: 'අ'.repeat(400) })).body;

    expect([...body]).toHaveLength(BANNER_BODY_LENGTH);
    expect(body.startsWith('අ')).toBe(true);
  });
});

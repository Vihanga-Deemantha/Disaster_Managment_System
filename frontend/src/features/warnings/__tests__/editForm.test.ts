import { changesFrom, initialValues, validateEdit, type EditValues } from '../editForm';
import { aWarning } from '../testing/fixtures';

const valid = (): EditValues => ({
  severity: 'HIGH',
  validFrom: '2026-10-07T09:00',
  validTo: '2026-10-08T09:00',
  messages: { SI: 'සිංහල පෙළ', TA: 'தமிழ் உரை', EN: 'English text' },
});

describe('UC-1 E1: validateEdit', () => {
  it('finds nothing wrong with a complete edit', () => {
    expect(validateEdit(valid())).toEqual({});
  });

  it.each(['SI', 'TA', 'EN'] as const)(
    'asks for the %s text when it is empty or only spaces',
    (language) => {
      const values = valid();
      values.messages[language] = '   ';

      expect(validateEdit(values)).toEqual({ [`messages.${language}`]: 'MESSAGE_REQUIRED' });
    },
  );

  it('allows exactly one SMS and refuses one character more', () => {
    const values = valid();
    values.messages.EN = 'x'.repeat(160);
    expect(validateEdit(values)).toEqual({});

    values.messages.EN = 'x'.repeat(161);
    expect(validateEdit(values)).toEqual({ 'messages.EN': 'SMS_TOO_LONG' });
  });

  it('measures the SMS rule in characters a person sees, not in bytes', () => {
    const values = valid();
    values.messages.SI = 'ග'.repeat(160);

    expect(validateEdit(values)).toEqual({});
  });

  it('refuses a time that is not a date, and does not also call it "before the start"', () => {
    const values = valid();
    values.validTo = '';
    values.validFrom = 'soon';

    expect(validateEdit(values)).toEqual({ validFrom: 'DATE_INVALID', validTo: 'DATE_INVALID' });
  });

  it.each(['2026-10-07T09:00', '2026-10-06T09:00'])(
    'refuses an end time that is not after the start (%s)',
    (validTo) => {
      expect(validateEdit({ ...valid(), validTo })).toEqual({ validTo: 'VALIDITY_WINDOW_INVALID' });
    },
  );

  it('reports every mistake at once, so the form can mark them all', () => {
    const values = valid();
    values.messages.TA = '';
    values.messages.EN = 'x'.repeat(200);
    values.validTo = '2026-10-01T09:00';

    expect(validateEdit(values)).toEqual({
      'messages.TA': 'MESSAGE_REQUIRED',
      'messages.EN': 'SMS_TOO_LONG',
      validTo: 'VALIDITY_WINDOW_INVALID',
    });
  });
});

describe('UC-1 A2: initialValues and changesFrom', () => {
  const warning = aWarning({
    validFrom: new Date(2026, 9, 7, 9, 0, 30).toISOString(),
    validTo: new Date(2026, 9, 8, 9, 0, 30).toISOString(),
  });

  it('starts from what the warning says now, with the times on the officer’s clock', () => {
    expect(initialValues(warning)).toEqual({
      severity: 'HIGH',
      validFrom: '2026-10-07T09:00',
      validTo: '2026-10-08T09:00',
      messages: warning.messages,
    });
  });

  it('gives the form its own copy of the messages', () => {
    initialValues(warning).messages.EN = 'changed';

    expect(warning.messages.EN).not.toBe('changed');
  });

  it('sends nothing when nothing changed, even though the seconds were cut off the times', () => {
    expect(changesFrom(warning, initialValues(warning))).toEqual({});
  });

  it('sends only the fields that changed', () => {
    const values = initialValues(warning);
    values.severity = 'CRITICAL';
    values.messages.SI = 'නව පෙළ';
    values.validTo = '2026-10-09T10:30';

    expect(changesFrom(warning, values)).toEqual({
      severity: 'CRITICAL',
      messages: { SI: 'නව පෙළ' },
      validTo: new Date(2026, 9, 9, 10, 30).toISOString(),
    });
  });

  it('sends a changed start time, and only that', () => {
    const values = initialValues(warning);
    values.validFrom = '2026-10-07T08:00';

    expect(changesFrom(warning, values)).toStrictEqual({
      validFrom: new Date(2026, 9, 7, 8, 0).toISOString(),
    });
  });
});

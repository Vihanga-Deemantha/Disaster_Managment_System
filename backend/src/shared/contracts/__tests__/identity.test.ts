import {
  checkPassword,
  maskNic,
  normalizeNic,
  normalizePhone,
  parseNic,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../identity';

const YEAR = 2026;

describe('parseNic', () => {
  it('accepts an old-format NIC and converts it to the canonical 12-digit form', () => {
    const result = parseNic('853400937V', YEAR);
    expect(result).toEqual({
      ok: true,
      value: {
        format: 'OLD',
        canonical: '198534000937',
        birthYear: 1985,
        dayOfYear: 340,
        gender: 'MALE',
      },
    });
  });

  it('accepts the trailing letter in either case, and X as well as V', () => {
    expect(parseNic('853400937v', YEAR).ok).toBe(true);
    expect(parseNic('853400937X', YEAR).ok).toBe(true);
    expect(parseNic('853400937x', YEAR).ok).toBe(true);
  });

  it('accepts a new-format NIC unchanged', () => {
    const result = parseNic('199012345678', YEAR);
    expect(result).toMatchObject({
      ok: true,
      value: { format: 'NEW', canonical: '199012345678', birthYear: 1990, dayOfYear: 123 },
    });
  });

  it('gives the same canonical value for the old and new forms of one card', () => {
    const oldForm = parseNic('853400937V', YEAR);
    const newForm = parseNic('198534000937', YEAR);
    expect(oldForm.ok && newForm.ok && oldForm.value.canonical === newForm.value.canonical).toBe(
      true,
    );
  });

  it('reads a day-of-year above 500 as a woman and subtracts 500', () => {
    const result = parseNic('198564000937', YEAR);
    expect(result).toMatchObject({ ok: true, value: { gender: 'FEMALE', dayOfYear: 140 } });
  });

  it('trims surrounding whitespace', () => {
    expect(parseNic('  199012345678  ', YEAR).ok).toBe(true);
  });

  it.each(['', '12345', '12345678V', '1234567890V', '19901234567', '1990123456789', 'ABCDEFGHIJK'])(
    'rejects the malformed value %j',
    (value) => {
      expect(parseNic(value, YEAR)).toEqual({ ok: false, reason: 'NIC_FORMAT' });
    },
  );

  it('rejects a birth year before 1900 and one in the future, accepting the boundaries', () => {
    expect(parseNic('189912345678', YEAR)).toEqual({ ok: false, reason: 'NIC_BIRTH_YEAR' });
    expect(parseNic('190012345678', YEAR).ok).toBe(true);
    expect(parseNic('202612345678', YEAR).ok).toBe(true);
    expect(parseNic('202712345678', YEAR)).toEqual({ ok: false, reason: 'NIC_BIRTH_YEAR' });
  });

  it('defaults the current year to the real clock', () => {
    expect(parseNic('199012345678').ok).toBe(true);
  });

  it.each([
    ['day 000', '199000045678'],
    ['day 367', '199036745678'],
    ['day 500 (neither male nor female range)', '199050045678'],
    ['day 867 (female range overflow)', '199086745678'],
  ])('rejects an impossible day of year: %s', (_label, value) => {
    expect(parseNic(value, YEAR)).toEqual({ ok: false, reason: 'NIC_DAY_OF_YEAR' });
  });

  it('accepts the first and last valid day for both genders', () => {
    expect(parseNic('199000145678', YEAR).ok).toBe(true);
    expect(parseNic('199036645678', YEAR).ok).toBe(true);
    expect(parseNic('199050145678', YEAR).ok).toBe(true);
    expect(parseNic('199086645678', YEAR).ok).toBe(true);
  });
});

describe('normalizeNic and maskNic', () => {
  it('upper-cases and trims', () => {
    expect(normalizeNic(' 853400937v ')).toBe('853400937V');
  });

  it('shows only the last three characters', () => {
    expect(maskNic('853400937V')).toBe('*******37V');
    expect(maskNic('199012345678')).toBe('*********678');
  });

  it('never reveals more than it has when the value is very short', () => {
    expect(maskNic('ab')).toBe('ab');
  });
});

describe('normalizePhone', () => {
  it.each([
    ['0771234567', '+94771234567'],
    ['+94771234567', '+94771234567'],
    ['077 123 4567', '+94771234567'],
    ['077-123-4567', '+94771234567'],
    ['(077) 1234567', '+94771234567'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['0112345678', '771234567', '07712345', '077123456789', '+94571234567', 'abc', ''])(
    'rejects %j',
    (input) => {
      expect(normalizePhone(input)).toBeUndefined();
    },
  );
});

describe('checkPassword', () => {
  it('accepts a password exactly at the minimum length', () => {
    expect(checkPassword('x'.repeat(PASSWORD_MIN_LENGTH - 1) + 'k')).toBeUndefined();
  });

  it('rejects a password one character below the minimum', () => {
    expect(checkPassword('Tr0ub4dor')).toBe('PASSWORD_TOO_SHORT');
  });

  it('accepts a password exactly at the maximum and rejects one above it', () => {
    const atMax = 'ab'.repeat(PASSWORD_MAX_LENGTH / 2);
    expect(checkPassword(atMax)).toBeUndefined();
    expect(checkPassword(`${atMax}z`)).toBe('PASSWORD_TOO_LONG');
  });

  it('counts Unicode code points, so a Sinhala passphrase is measured fairly', () => {
    expect(checkPassword('සුභ දවසක් ඔබට')).toBeUndefined();
    expect(checkPassword('සුභ')).toBe('PASSWORD_TOO_SHORT');
  });

  it.each(['password123', 'PassWord123', 'qwertyuiop', 'iloveyou123'])(
    'rejects the common password %s regardless of case',
    (value) => {
      expect(checkPassword(value)).toBe('PASSWORD_TOO_COMMON');
    },
  );

  it.each(['aaaaaaaaaaaa', '1111111111', 'abcdefghijklm', 'mlkjihgfedcb'])(
    'rejects the trivial pattern %s (repeated, ascending or descending run)',
    (value) => {
      expect(checkPassword(value)).toBe('PASSWORD_TOO_COMMON');
    },
  );

  it('does not treat a run that breaks partway as trivial', () => {
    expect(checkPassword('0123456789abc')).toBeUndefined();
  });

  it('does not demand upper-case, digits or symbols (length is the rule)', () => {
    expect(checkPassword('correct horse battery')).toBeUndefined();
  });
});

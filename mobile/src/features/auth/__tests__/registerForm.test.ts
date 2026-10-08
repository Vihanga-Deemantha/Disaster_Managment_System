import {
  buildRequest,
  emptyForm,
  phoneForRequest,
  serverFieldCodes,
  validate,
  type RegisterFormValues,
} from '../domain/registerForm';

const YEAR = 2026;

/** A form that passes every rule; each test changes the one thing it is about. */
const valid = (overrides: Partial<RegisterFormValues> = {}): RegisterFormValues => ({
  ...emptyForm('EN'),
  nic: '200012345678',
  fullName: 'Nimali Perera',
  phone: '77 123 4567',
  password: 'sunrise over galle fort',
  district: 'GAMPAHA',
  lat: '7.0873',
  lng: '79.9925',
  ...overrides,
});

describe('emptyForm', () => {
  it('starts blank, in the language of the screen, with no extra channels', () => {
    expect(emptyForm('SI')).toEqual({
      nic: '',
      fullName: '',
      phone: '',
      password: '',
      preferredLanguage: 'SI',
      district: '',
      lat: '',
      lng: '',
      addressLine: '',
      whatsappOptIn: false,
      emailOptIn: false,
      email: '',
    });
  });
});

describe('phoneForRequest', () => {
  it.each([
    ['77 123 4567', '+94771234567'],
    ['(77) 123-4567', '+94771234567'],
    ['771234567', '+94771234567'],
  ])('completes the national part %s', (typed, expected) => {
    expect(phoneForRequest(typed)).toBe(expected);
  });

  it.each(['077 123 4567', '+94 77 123 4567', '0112345678', 'abc', ''])(
    'sends %j as typed, for the server rule to judge',
    (typed) => {
      expect(phoneForRequest(typed)).toBe(typed);
    },
  );
});

describe('validate', () => {
  it('accepts a complete form', () => {
    expect(validate(valid(), YEAR)).toEqual({});
  });

  it('asks for everything on an empty form, with the codes the server uses', () => {
    expect(validate(emptyForm('EN'), YEAR)).toEqual({
      nic: 'NIC_FORMAT',
      fullName: 'NAME_REQUIRED',
      phone: 'PHONE_INVALID',
      password: 'PASSWORD_TOO_SHORT',
      district: 'DISTRICT_INVALID',
      location: 'LOCATION_REQUIRED',
    });
  });

  it.each([
    ['123456789V', undefined],
    ['123456789x', undefined],
    ['200012345678', undefined],
    ['12345678', 'NIC_FORMAT'],
    ['12345678901', 'NIC_FORMAT'],
    ['12345678VV', 'NIC_FORMAT'],
    ['189912345678', 'NIC_BIRTH_YEAR'],
    ['202712345678', 'NIC_BIRTH_YEAR'],
    ['200000012345', 'NIC_DAY_OF_YEAR'],
    ['200099912345', 'NIC_DAY_OF_YEAR'],
    ['200050012345', 'NIC_DAY_OF_YEAR'],
    ['200060012345', undefined],
    ['200090012345', 'NIC_DAY_OF_YEAR'],
  ])('checks the NIC %s', (nic, expected) => {
    expect(validate(valid({ nic }), YEAR).nic).toBe(expected);
  });

  it('ignores spaces around the NIC and the name', () => {
    expect(validate(valid({ nic: ' 200012345678 ', fullName: '  Ru  ' }), YEAR)).toEqual({});
  });

  it.each([
    ['', 'NAME_REQUIRED'],
    ['  A  ', 'NAME_REQUIRED'],
    ['Al', undefined],
    ['නිමලි', undefined],
    ['x'.repeat(100), undefined],
    ['x'.repeat(101), 'NAME_TOO_LONG'],
  ])('checks the name %j', (fullName, expected) => {
    expect(validate(valid({ fullName }), YEAR).fullName).toBe(expected);
  });

  it.each([
    ['77 123 4567', undefined],
    ['077 123 4567', undefined],
    ['+94 77 123 4567', undefined],
    ['0112345678', 'PHONE_INVALID'],
    ['66 123 4567', 'PHONE_INVALID'],
    ['77 123 456', 'PHONE_INVALID'],
    ['', 'PHONE_INVALID'],
  ])('checks the phone %j', (phone, expected) => {
    expect(validate(valid({ phone }), YEAR).phone).toBe(expected);
  });

  it.each([
    ['short', 'PASSWORD_TOO_SHORT'],
    ['', 'PASSWORD_TOO_SHORT'],
    ['password123', 'PASSWORD_TOO_COMMON'],
    ['aaaaaaaaaaaa', 'PASSWORD_TOO_COMMON'],
    ['abcdefghijkl', 'PASSWORD_TOO_COMMON'],
    ['x'.repeat(129), 'PASSWORD_TOO_LONG'],
    ['ten chars!!', undefined],
    ['සිංහල මුරපදයක් නිවැරදියි', undefined],
  ])('checks the password %j', (password, expected) => {
    expect(validate(valid({ password }), YEAR).password).toBe(expected);
  });

  it('wants one of the 25 districts', () => {
    expect(validate(valid({ district: '' }), YEAR).district).toBe('DISTRICT_INVALID');
    expect(validate(valid({ district: 'NUWARA_ELIYA' }), YEAR).district).toBeUndefined();
  });

  it('wants one of the three languages', () => {
    const bad = valid({ preferredLanguage: 'FR' as never });
    expect(validate(bad, YEAR).preferredLanguage).toBe('LANGUAGE_INVALID');
  });

  it.each([
    ['', '', 'LOCATION_REQUIRED'],
    ['  ', ' ', 'LOCATION_REQUIRED'],
    ['7.0', '', 'LOCATION_INVALID'],
    ['', '79.9', 'LOCATION_INVALID'],
    ['abc', '79.9', 'LOCATION_INVALID'],
    ['7.0', 'north', 'LOCATION_INVALID'],
    ['91', '79.9', 'LOCATION_INVALID'],
    ['-91', '79.9', 'LOCATION_INVALID'],
    ['7.0', '181', 'LOCATION_INVALID'],
    ['7.0', '-181', 'LOCATION_INVALID'],
    ['Infinity', '79.9', 'LOCATION_INVALID'],
    ['90', '180', undefined],
    ['-90', '-180', undefined],
    [' 7.0873 ', ' 79.9925 ', undefined],
  ])('checks the location %j, %j', (lat, lng, expected) => {
    expect(validate(valid({ lat, lng }), YEAR).location).toBe(expected);
  });

  it('allows an address up to 200 characters', () => {
    expect(validate(valid({ addressLine: 'x'.repeat(200) }), YEAR).addressLine).toBeUndefined();
    expect(validate(valid({ addressLine: 'x'.repeat(201) }), YEAR).addressLine).toBe(
      'ADDRESS_TOO_LONG',
    );
  });

  it.each([
    [false, '', undefined],
    [true, '', 'EMAIL_REQUIRED_FOR_OPT_IN'],
    [true, '   ', 'EMAIL_REQUIRED_FOR_OPT_IN'],
    [true, 'nimali@example.lk', undefined],
    [false, 'nimali@example.lk', undefined],
    [true, 'not an email', 'EMAIL_INVALID'],
    [false, 'half@', 'EMAIL_INVALID'],
    [true, 'a..b@example.lk', 'EMAIL_INVALID'],
    [true, `${'a'.repeat(250)}@x.lk`, 'EMAIL_INVALID'],
  ])('checks the e-mail when opted in = %s and typed %j', (emailOptIn, email, expected) => {
    expect(validate(valid({ emailOptIn, email }), YEAR).email).toBe(expected);
  });
});

describe('buildRequest', () => {
  const context = { currentYear: YEAR, confirmDistrictMismatch: false };

  it('builds what the API takes from a complete form', () => {
    expect(buildRequest(valid(), context)).toEqual({
      nic: '200012345678',
      fullName: 'Nimali Perera',
      phone: '+94771234567',
      password: 'sunrise over galle fort',
      homeLocation: { lat: 7.0873, lng: 79.9925 },
      district: 'GAMPAHA',
      preferredLanguage: 'EN',
      whatsappOptIn: false,
      emailOptIn: false,
      confirmDistrictMismatch: false,
    });
  });

  it('leaves out an empty address and e-mail, and trims the ones given', () => {
    const request = buildRequest(
      valid({ addressLine: '  12 Temple Road ', emailOptIn: true, email: ' n@example.lk ' }),
      context,
    );

    expect(request).toMatchObject({ addressLine: '12 Temple Road', email: 'n@example.lk' });
    const bare = buildRequest(valid({ addressLine: '  ', email: '' }), context);
    expect(bare && 'addressLine' in bare).toBe(false);
    expect(bare && 'email' in bare).toBe(false);
  });

  it('carries the device marker only when there is one', () => {
    expect(buildRequest(valid(), { ...context, deviceToken: 'device-1' })).toMatchObject({
      deviceToken: 'device-1',
    });
    const without = buildRequest(valid(), context);
    expect(without && 'deviceToken' in without).toBe(false);
  });

  it('passes on the citizen’s choice about a district mismatch and their channels', () => {
    const request = buildRequest(valid({ whatsappOptIn: true }), {
      ...context,
      confirmDistrictMismatch: true,
    });

    expect(request).toMatchObject({ confirmDistrictMismatch: true, whatsappOptIn: true });
  });

  it('refuses to build from a form with a problem', () => {
    expect(buildRequest(valid({ nic: 'nope' }), context)).toBeUndefined();
    expect(buildRequest(emptyForm('EN'), context)).toBeUndefined();
  });
});

describe('serverFieldCodes', () => {
  it('maps the server’s field paths to the form’s fields', () => {
    expect(
      serverFieldCodes('VALIDATION_FAILED', [
        { field: 'nic', code: 'NIC_FORMAT' },
        { field: 'homeLocation.lat', code: 'LOCATION_INVALID' },
        { field: 'email', code: 'EMAIL_INVALID' },
        { field: 'unknownField', code: 'X' },
      ]),
    ).toEqual({ nic: 'NIC_FORMAT', location: 'LOCATION_INVALID', email: 'EMAIL_INVALID' });
  });

  it.each([
    ['NIC_ALREADY_REGISTERED', { nic: 'NIC_ALREADY_REGISTERED' }],
    ['PHONE_ALREADY_REGISTERED', { phone: 'PHONE_ALREADY_REGISTERED' }],
    ['LOCATION_OUTSIDE_SRI_LANKA', { location: 'LOCATION_OUTSIDE_SRI_LANKA' }],
    ['SOMETHING_ELSE', {}],
  ])('knows that %s belongs to one field', (code, expected) => {
    expect(serverFieldCodes(code, [])).toEqual(expected);
  });

  it('keeps the first thing said about a field', () => {
    expect(
      serverFieldCodes('PHONE_ALREADY_REGISTERED', [{ field: 'phone', code: 'PHONE_INVALID' }]),
    ).toEqual({ phone: 'PHONE_ALREADY_REGISTERED' });
  });
});

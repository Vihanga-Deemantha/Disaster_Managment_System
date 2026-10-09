import {
  emptyForm,
  phoneForRequest,
  serverFieldCodes,
  toRequest,
  validate,
  type RegisterFormValues,
} from '../registerForm';

const valid = (overrides: Partial<RegisterFormValues> = {}): RegisterFormValues => ({
  ...emptyForm('SI'),
  nic: '199001234567',
  fullName: 'Test Citizen',
  phone: '077 123 4567',
  password: 'correct horse battery',
  district: 'GAMPAHA',
  lat: '7.0873',
  lng: '79.9925',
  ...overrides,
});

describe('emptyForm', () => {
  it('starts blank, with alerts in the language the page is shown in', () => {
    expect(emptyForm('TA')).toMatchObject({
      nic: '',
      district: '',
      preferredLanguage: 'TA',
      whatsappOptIn: false,
      emailOptIn: false,
    });
  });
});

describe('phoneForRequest (the box already shows "+94")', () => {
  it.each([
    ['77 123 4567', '+94771234567'],
    ['771234567', '+94771234567'],
    ['77-123-4567', '+94771234567'],
    ['(77) 123 4567', '+94771234567'],
    ['  77 123 4567  ', '+94771234567'],
  ])('completes %j to %s', (typed, expected) => {
    expect(phoneForRequest(typed)).toBe(expected);
  });

  it.each([['077 123 4567'], ['+94 77 123 4567'], ['0771234567'], ['12345'], ['']])(
    'sends %j as typed, and leaves the verdict to the same schema the server uses',
    (typed) => {
      expect(phoneForRequest(typed)).toBe(typed);
    },
  );

  it('is what makes a number typed after the prefix valid', () => {
    expect(validate(valid({ phone: '77 123 4567' })).phone).toBeUndefined();
    expect(validate(valid({ phone: '66 123 4567' })).phone).toBe('PHONE_INVALID');
  });

  it('is applied to the request', () => {
    const request = toRequest(valid({ phone: '77 123 4567' }), false) as { phone: string };

    expect(request.phone).toBe('+94771234567');
  });
});

describe('toRequest', () => {
  it('builds exactly what the API expects from what the person typed', () => {
    expect(
      toRequest(valid({ addressLine: ' 12 Temple Rd ', email: '', whatsappOptIn: true }), false),
    ).toEqual({
      nic: '199001234567',
      fullName: 'Test Citizen',
      phone: '077 123 4567',
      password: 'correct horse battery',
      preferredLanguage: 'SI',
      district: 'GAMPAHA',
      homeLocation: { lat: 7.0873, lng: 79.9925 },
      addressLine: '12 Temple Rd',
      whatsappOptIn: true,
      emailOptIn: false,
      email: undefined,
      confirmDistrictMismatch: false,
    });
  });

  it('sends no location at all when both boxes are blank, so the form can say "set your location"', () => {
    expect(
      (toRequest(valid({ lat: '', lng: ' ' }), false) as { homeLocation: unknown }).homeLocation,
    ).toBeUndefined();
  });

  it('turns a non-numeric coordinate into NaN so it is rejected rather than guessed at', () => {
    const location = (
      toRequest(valid({ lat: 'north', lng: '80' }), false) as {
        homeLocation: { lat: number; lng: number };
      }
    ).homeLocation;

    expect(location.lat).toBeNaN();
    expect(location.lng).toBe(80);
  });

  it('carries the "keep my district" confirmation', () => {
    expect(
      (toRequest(valid(), true) as { confirmDistrictMismatch: boolean }).confirmDistrictMismatch,
    ).toBe(true);
  });
});

describe('validate (the very schema the server uses)', () => {
  it('accepts a complete form', () => {
    expect(validate(valid())).toEqual({});
  });

  it('says what is missing from a blank form', () => {
    expect(validate(emptyForm('EN'))).toEqual({
      nic: 'NIC_FORMAT',
      fullName: 'NAME_REQUIRED',
      phone: 'PHONE_INVALID',
      password: 'PASSWORD_TOO_SHORT',
      district: 'DISTRICT_INVALID',
      location: 'LOCATION_REQUIRED',
    });
  });

  it.each([
    ['a bad NIC', { nic: '12345' }, 'nic', 'NIC_FORMAT'],
    ['an impossible NIC birth day', { nic: '199036745678' }, 'nic', 'NIC_DAY_OF_YEAR'],
    ['a landline', { phone: '0112345678' }, 'phone', 'PHONE_INVALID'],
    ['a short password', { password: 'short' }, 'password', 'PASSWORD_TOO_SHORT'],
    ['a common password', { password: 'password123' }, 'password', 'PASSWORD_TOO_COMMON'],
    ['a one-letter name', { fullName: 'A' }, 'fullName', 'NAME_REQUIRED'],
    ['an over-long address', { addressLine: 'x'.repeat(201) }, 'addressLine', 'ADDRESS_TOO_LONG'],
    ['a latitude out of range', { lat: '95' }, 'location', 'LOCATION_INVALID'],
    ['a non-numeric longitude', { lng: 'west' }, 'location', 'LOCATION_INVALID'],
    ['email alerts without an address', { emailOptIn: true }, 'email', 'EMAIL_REQUIRED_FOR_OPT_IN'],
    ['a bad email address', { emailOptIn: true, email: 'nope' }, 'email', 'EMAIL_INVALID'],
  ])('flags %s', (_label, change, field, code) => {
    expect(validate(valid(change))[field as 'nic']).toBe(code);
  });

  it('reports the first problem per field, not a pile', () => {
    expect(validate(valid({ nic: 'x' }))).toEqual({ nic: 'NIC_FORMAT' });
  });
});

describe('serverFieldCodes', () => {
  it('maps known 409 and 422 codes onto the field the person must fix', () => {
    expect(serverFieldCodes('NIC_ALREADY_REGISTERED', [])).toEqual({
      nic: 'NIC_ALREADY_REGISTERED',
    });
    expect(serverFieldCodes('PHONE_ALREADY_REGISTERED', [])).toEqual({
      phone: 'PHONE_ALREADY_REGISTERED',
    });
    expect(serverFieldCodes('LOCATION_OUTSIDE_SRI_LANKA', [])).toEqual({
      location: 'LOCATION_OUTSIDE_SRI_LANKA',
    });
  });

  it('maps the field list of a 400 onto the visible fields, including nested location errors', () => {
    expect(
      serverFieldCodes('VALIDATION_FAILED', [
        { field: 'homeLocation.lat', code: 'LOCATION_INVALID' },
        { field: 'nic', code: 'NIC_FORMAT' },
        { field: 'confirmDistrictMismatch', code: 'X' },
      ]),
    ).toEqual({ location: 'LOCATION_INVALID', nic: 'NIC_FORMAT' });
  });

  it('keeps a specific code over a generic field error for the same field', () => {
    expect(
      serverFieldCodes('NIC_ALREADY_REGISTERED', [{ field: 'nic', code: 'NIC_FORMAT' }]),
    ).toEqual({
      nic: 'NIC_ALREADY_REGISTERED',
    });
  });

  it('returns nothing for a code that is not about a field', () => {
    expect(serverFieldCodes('INTERNAL_ERROR', [])).toEqual({});
  });
});

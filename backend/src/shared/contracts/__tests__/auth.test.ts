import {
  changePasswordSchema,
  loginSchema,
  reauthSchema,
  registerSchema,
  type RegisterRequest,
} from '../auth';

const validRegistration: RegisterRequest = {
  nic: '199001234567',
  fullName: 'Test Citizen',
  phone: '077 123 4567',
  password: 'correct horse battery',
  homeLocation: { lat: 7.0873, lng: 79.9925 },
  district: 'GAMPAHA',
  preferredLanguage: 'SI',
};

const issueCodes = (input: unknown) => {
  const result = registerSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message]);
};

describe('registerSchema', () => {
  it('accepts a complete registration and normalises what it must', () => {
    const result = registerSchema.parse({
      ...validRegistration,
      nic: ' 853400937v ',
      fullName: '  Test Citizen  ',
    });

    expect(result).toMatchObject({
      nic: '853400937V',
      fullName: 'Test Citizen',
      phone: '+94771234567',
      whatsappOptIn: false,
      emailOptIn: false,
      confirmDistrictMismatch: false,
    });
  });

  it('keeps optional fields optional', () => {
    const result = registerSchema.parse(validRegistration);

    expect(result.email).toBeUndefined();
    expect(result.deviceToken).toBeUndefined();
    expect(result.addressLine).toBeUndefined();
  });

  it('accepts a full set of optional fields', () => {
    const result = registerSchema.parse({
      ...validRegistration,
      email: 'citizen@example.com',
      emailOptIn: true,
      whatsappOptIn: true,
      deviceToken: 'token-123',
      addressLine: '12 Temple Road, Gampaha',
      confirmDistrictMismatch: true,
    });

    expect(result).toMatchObject({
      emailOptIn: true,
      whatsappOptIn: true,
      confirmDistrictMismatch: true,
    });
  });

  it.each([
    ['a malformed NIC', { nic: '12345' }, ['nic', 'NIC_FORMAT']],
    ['an impossible birth year', { nic: '189912345678' }, ['nic', 'NIC_BIRTH_YEAR']],
    ['an impossible day of year', { nic: '199036745678' }, ['nic', 'NIC_DAY_OF_YEAR']],
    ['a landline number', { phone: '0112345678' }, ['phone', 'PHONE_INVALID']],
    ['a short password', { password: 'short' }, ['password', 'PASSWORD_TOO_SHORT']],
    ['a common password', { password: 'password123' }, ['password', 'PASSWORD_TOO_COMMON']],
    [
      'a latitude out of range',
      { homeLocation: { lat: 91, lng: 80 } },
      ['homeLocation.lat', 'LOCATION_INVALID'],
    ],
    [
      'a longitude out of range',
      { homeLocation: { lat: 7, lng: 181 } },
      ['homeLocation.lng', 'LOCATION_INVALID'],
    ],
    ['an unknown district', { district: 'ATLANTIS' }, ['district', 'DISTRICT_INVALID']],
    ['an unknown language', { preferredLanguage: 'FR' }, ['preferredLanguage', 'LANGUAGE_INVALID']],
    ['a one-letter name', { fullName: 'A' }, ['fullName', 'NAME_REQUIRED']],
    ['an over-long name', { fullName: 'A'.repeat(101) }, ['fullName', 'NAME_TOO_LONG']],
    ['a bad email', { email: 'not-an-email' }, ['email', 'EMAIL_INVALID']],
    ['an over-long address', { addressLine: 'x'.repeat(201) }, ['addressLine', 'ADDRESS_TOO_LONG']],
  ])('reports %s with a machine-readable code', (_label, change, expected) => {
    expect(issueCodes({ ...validRegistration, ...change })).toContainEqual(expected);
  });

  it('requires an email address when email alerts are opted into', () => {
    expect(issueCodes({ ...validRegistration, emailOptIn: true })).toContainEqual([
      'email',
      'EMAIL_REQUIRED_FOR_OPT_IN',
    ]);
  });

  it('reports the email requirement together with other problems, not only after they are fixed', () => {
    const codes = issueCodes({ ...validRegistration, nic: 'x', emailOptIn: true });

    expect(codes).toContainEqual(['nic', 'NIC_FORMAT']);
    expect(codes).toContainEqual(['email', 'EMAIL_REQUIRED_FOR_OPT_IN']);
  });

  it('does not repeat itself when the email address is present but malformed', () => {
    const codes = issueCodes({ ...validRegistration, emailOptIn: true, email: 'not-an-email' });

    expect(codes.filter(([field]) => field === 'email')).toEqual([['email', 'EMAIL_INVALID']]);
  });

  it('survives a body that is not an object at all', () => {
    expect(registerSchema.safeParse(null).success).toBe(false);
    expect(registerSchema.safeParse('text').success).toBe(false);
  });

  it('reports every bad field at once, so the form can mark them all', () => {
    const codes = issueCodes({ ...validRegistration, nic: 'x', phone: 'y', password: 'z' });

    expect(codes.map(([field]) => field).sort()).toEqual(['nic', 'password', 'phone']);
  });

  it('rejects a missing required field', () => {
    const { nic: _nic, ...withoutNic } = validRegistration;

    expect(issueCodes(withoutNic).map(([field]) => field)).toContain('nic');
  });
});

describe('loginSchema, reauthSchema and changePasswordSchema', () => {
  it('trims the identifier but never the password', () => {
    const parsed = loginSchema.parse({ identifier: '  a@b.lk ', password: ' spaces kept ' });

    expect(parsed).toEqual({ identifier: 'a@b.lk', password: ' spaces kept ' });
  });

  it('rejects an empty identifier or password', () => {
    expect(loginSchema.safeParse({ identifier: '', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: 'a', password: '' }).success).toBe(false);
    expect(reauthSchema.safeParse({ password: '' }).success).toBe(false);
  });

  it('caps absurd input lengths, so hashing cannot be used to burn CPU', () => {
    expect(loginSchema.safeParse({ identifier: 'a', password: 'x'.repeat(129) }).success).toBe(
      false,
    );
    expect(loginSchema.safeParse({ identifier: 'a'.repeat(255), password: 'x' }).success).toBe(
      false,
    );
  });

  it('holds the new password to the same policy as registration', () => {
    const weak = changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'short' });
    const strong = changePasswordSchema.safeParse({
      currentPassword: 'old',
      newPassword: 'a long enough passphrase',
    });

    expect(weak.success).toBe(false);
    expect(strong.success).toBe(true);
  });
});

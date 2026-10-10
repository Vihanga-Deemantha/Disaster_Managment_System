/**
 * The phone keeps its own copy of the rules it shares with the API, because the mobile app is not one
 * of the npm workspaces and cannot import `backend/src/shared/contracts`. These tests run both copies
 * on the same inputs and fail the day they disagree, so the copy cannot quietly rot.
 */
import * as backendAuth from '../../../../backend/src/shared/contracts/auth';
import * as backendEnums from '../../../../backend/src/shared/contracts/enums';
import * as backendIdentity from '../../../../backend/src/shared/contracts/identity';
import {
  emptyForm,
  phoneForRequest,
  validate,
  type FieldCodes,
  type RegisterFormValues,
} from '@/features/auth/domain/registerForm';
import * as enums from '../contracts/enums';
import * as identity from '../contracts/identity';
import { en } from '../i18n/messages.en';

const YEAR = 2026;

describe('enums: the same lists as the API', () => {
  it.each([
    'ROLES',
    'PUBLIC_ROLES',
    'DISTRICTS',
    'LANGUAGES',
    'AREA_TYPES',
    'HAZARD_TYPES',
    'SEVERITIES',
  ] as const)('%s', (name) => {
    expect([...enums[name]]).toEqual([...backendEnums[name]]);
  });

  it('every district and hazard has a name in the phone’s own texts, and in English they match the API’s', () => {
    for (const district of backendEnums.DISTRICTS) {
      expect(en[`district.${district}`]).toBe(backendEnums.DISTRICT_LABELS[district]);
    }
    for (const hazard of backendEnums.HAZARD_TYPES) {
      expect(en[`hazard.${hazard}`].toUpperCase().replaceAll(' ', '_')).toBe(hazard);
    }
  });

  it('isPublicRole agrees with the API about who may register themselves', () => {
    for (const role of backendEnums.ROLES) {
      expect(enums.isPublicRole(role)).toBe(
        (backendEnums.PUBLIC_ROLES as readonly string[]).includes(role),
      );
    }
  });
});

describe('identity: the same verdicts as the API', () => {
  const nics = [
    '123456789V',
    '123456789v',
    '123456789X',
    '200012345678',
    '199912345678',
    '189912345678',
    '202712345678',
    '202612345678',
    '200000012345',
    '200036612345',
    '200036712345',
    '200050012345',
    '200050112345',
    '200086612345',
    '200086712345',
    '12345678',
    '1234567890123',
    'ABCDEFGHIJ',
    ' 200012345678 ',
    '',
  ];

  it.each(nics)('NIC %j', (nic) => {
    const mine = identity.parseNic(nic, YEAR);
    const theirs = backendIdentity.parseNic(nic, YEAR);
    expect(mine.ok).toBe(theirs.ok);
    if (!mine.ok && !theirs.ok) expect(mine.reason).toBe(theirs.reason);
  });

  it.each([
    '0771234567',
    '+94771234567',
    '94771234567',
    '077 123 4567',
    '(077) 123-4567',
    '0112345678',
    '0661234567',
    '07712345678',
    '+947712345',
    'abc',
    '',
  ])('phone %j', (phone) => {
    expect(identity.normalizePhone(phone)).toBe(backendIdentity.normalizePhone(phone));
  });

  it('password verdicts, including every password the API blocks by name', () => {
    const blocked = [
      '1234567890',
      '0123456789',
      '9876543210',
      '12345678910',
      '1234567891',
      'qwertyuiop',
      'qwerty1234',
      'qwerty12345',
      'qwerty123456',
      'asdfghjkl1',
      'asdfghjklqwerty',
      '1q2w3e4r5t',
      '1qaz2wsx3e',
      'abcdefghij',
      'abcd123456',
      'abc1234567',
      'password12',
      'password123',
      'password1234',
      'password12345',
      'passw0rd123',
      'p@ssword123',
      'p@ssw0rd123',
      'iloveyou12',
      'iloveyou123',
      'welcome123',
      'welcome1234',
      'letmein123',
      'letmein1234',
      'changeme123',
      'changeme1234',
      'administrator',
      'admin12345',
      'admin123456',
      'trustno1234',
      'sunshine123',
      'princess123',
      'football123',
      'monkey12345',
      'dragon12345',
      'srilanka123',
      'srilanka1234',
      'colombo123',
      'colombo1234',
      'sinhala123',
      'safezone123',
      'safezone1234',
      'disaster123',
      'PASSWORD123',
    ];
    const others = [
      '',
      'short',
      'ninechars',
      'tencharsok',
      'aaaaaaaaaaaa',
      'abcdefghijkl',
      'zyxwvutsrqpo',
      '0123456789012',
      'a long passphrase with spaces',
      'සිංහල මුරපදයක් නිවැරදියි',
      'x'.repeat(128),
      'x'.repeat(129),
      'xy'.repeat(65),
    ];
    for (const password of [...blocked, ...others]) {
      expect([password, identity.checkPassword(password)]).toEqual([
        password,
        backendIdentity.checkPassword(password),
      ]);
    }
    expect(identity.PASSWORD_MIN_LENGTH).toBe(backendIdentity.PASSWORD_MIN_LENGTH);
    expect(identity.PASSWORD_MAX_LENGTH).toBe(backendIdentity.PASSWORD_MAX_LENGTH);
  });
});

/** What the web form sends to the schema, so the same values can be given to both. */
function webRequest(values: RegisterFormValues): unknown {
  const number = (text: string) => (text.trim() === '' ? undefined : Number(text.trim()));
  const lat = number(values.lat);
  const lng = number(values.lng);
  const blank = (text: string) => (text.trim() === '' ? undefined : text.trim());
  return {
    nic: values.nic,
    fullName: values.fullName,
    phone: phoneForRequest(values.phone),
    password: values.password,
    preferredLanguage: values.preferredLanguage,
    district: values.district,
    homeLocation: lat === undefined && lng === undefined ? undefined : { lat, lng },
    addressLine: blank(values.addressLine),
    whatsappOptIn: values.whatsappOptIn,
    emailOptIn: values.emailOptIn,
    email: blank(values.email),
    confirmDistrictMismatch: false,
  };
}

/** The first problem the server's schema finds in each field, as the web form reads them. */
function serverCodes(values: RegisterFormValues): FieldCodes {
  const result = backendAuth.registerSchema.safeParse(webRequest(values));
  if (result.success) return {};
  const locationMissing = values.lat.trim() === '' && values.lng.trim() === '';
  const codes: FieldCodes = {};
  for (const issue of result.error.issues) {
    const [first] = issue.path;
    const field = first === 'homeLocation' ? 'location' : String(first);
    const machine = /^[A-Z][A-Z0-9_]+$/.test(issue.message) && issue.message !== 'INVALID_TYPE';
    const code =
      field === 'location'
        ? locationMissing
          ? 'LOCATION_REQUIRED'
          : 'LOCATION_INVALID'
        : machine
          ? issue.message
          : 'REQUIRED';
    if (!(field in codes)) (codes as Record<string, string>)[field] = code;
  }
  return codes;
}

const base: RegisterFormValues = {
  ...emptyForm('EN'),
  nic: '200012345678',
  fullName: 'Nimali Perera',
  phone: '77 123 4567',
  password: 'sunrise over galle fort',
  district: 'GAMPAHA',
  lat: '7.0873',
  lng: '79.9925',
};

const cases: Array<[string, Partial<RegisterFormValues>]> = [
  ['a complete form', {}],
  ['an empty form', { ...emptyForm('EN') }],
  ['a bad NIC', { nic: '1234' }],
  ['a NIC with an impossible year', { nic: '189912345678' }],
  ['a NIC with an impossible day', { nic: '200000012345' }],
  ['an old-style NIC', { nic: '853456789V' }],
  ['a short name', { fullName: 'A' }],
  ['a very long name', { fullName: 'x'.repeat(101) }],
  ['a name of 51 emoji', { fullName: '😀'.repeat(51) }],
  ['a name of 101 emoji', { fullName: '😀'.repeat(101) }],
  ['an address of 101 emoji', { addressLine: '😀'.repeat(101) }],
  ['an address of 201 emoji', { addressLine: '😀'.repeat(201) }],
  ['a landline', { phone: '0112345678' }],
  ['a phone with the leading zero', { phone: '077 123 4567' }],
  ['a short password', { password: 'short' }],
  ['a common password', { password: 'password123' }],
  ['a very long password', { password: 'x'.repeat(129) }],
  ['no district', { district: '' }],
  ['a location of one blank', { lat: '7.1', lng: '' }],
  ['a location out of range', { lat: '95', lng: '79' }],
  ['a location that is not a number', { lat: 'north', lng: '79' }],
  ['no location', { lat: '', lng: '' }],
  ['a long address', { addressLine: 'x'.repeat(201) }],
  ['e-mail opted in but missing', { emailOptIn: true, email: '' }],
  ['e-mail opted in and valid', { emailOptIn: true, email: 'nimali@example.lk' }],
  ['e-mail opted in and invalid', { emailOptIn: true, email: 'nimali@' }],
  ['an e-mail typed but not opted in', { email: 'nimali@example.lk' }],
  ['an invalid e-mail typed but not opted in', { email: 'nope' }],
  ['an e-mail with a double dot', { emailOptIn: true, email: 'a..b@example.lk' }],
  ['an e-mail with a plus sign', { emailOptIn: true, email: 'nimali+sz@example.lk' }],
  ['an e-mail with a leading dot', { emailOptIn: true, email: '.nimali@example.lk' }],
  ['an e-mail with a one-letter domain end', { emailOptIn: true, email: 'n@example.l' }],
  [
    'everything wrong at once',
    { nic: 'x', fullName: '', phone: '1', password: '1', lat: 'a', lng: 'b', emailOptIn: true },
  ],
];

describe('the registration form: the same verdicts as the API’s schema', () => {
  it.each(cases)('%s', (_label, overrides) => {
    const values = { ...base, ...overrides };

    expect(validate(values, YEAR)).toEqual(serverCodes(values));
  });
});

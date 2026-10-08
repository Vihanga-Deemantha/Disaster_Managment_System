import type { FieldError, RegisterRequest } from '@/shared/contracts/auth';
import { DISTRICTS, LANGUAGES, type District, type Language } from '@/shared/contracts/enums';
import { checkPassword, normalizePhone, parseNic } from '@/shared/contracts/identity';

export interface RegisterFormValues {
  nic: string;
  fullName: string;
  phone: string;
  password: string;
  preferredLanguage: Language;
  district: District | '';
  lat: string;
  lng: string;
  addressLine: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  email: string;
}

/** The form fields a person can see an error on. */
export type FieldName =
  | 'nic'
  | 'fullName'
  | 'phone'
  | 'password'
  | 'preferredLanguage'
  | 'district'
  | 'location'
  | 'addressLine'
  | 'email';

/** Error *codes* by field. The screen translates them, so the same code reads right in every language. */
export type FieldCodes = Partial<Record<FieldName, string>>;

export const emptyForm = (language: Language): RegisterFormValues => ({
  nic: '',
  fullName: '',
  phone: '',
  password: '',
  preferredLanguage: language,
  district: '',
  lat: '',
  lng: '',
  addressLine: '',
  whatsappOptIn: false,
  emailOptIn: false,
  email: '',
});

const NATIONAL_MOBILE = /^7\d{8}$/;

/**
 * The phone box shows "+94" in front, so people type the rest ("77 123 4567"). That is completed to
 * the international form; anything else ("077 123 4567", "+94 77 …") is sent as typed and the same
 * rule the server uses decides whether it is a Sri Lankan mobile number.
 */
export function phoneForRequest(typed: string): string {
  const compact = typed.replace(/[\s\-()]/g, '');
  return NATIONAL_MOBILE.test(compact) ? `+94${compact}` : typed;
}

/** The same pattern the server's e-mail check uses, so the phone and the API agree on what an address is. */
const EMAIL =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 200;

/** A blank box is "not given" (undefined); anything else that is not a number becomes NaN and fails. */
const coordinate = (text: string): number | undefined => {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : Number(trimmed);
};

const blankToUndefined = (text: string): string | undefined =>
  text.trim() === '' ? undefined : text.trim();

const within = (value: number | undefined, limit: number): boolean =>
  value !== undefined && Number.isFinite(value) && Math.abs(value) <= limit;

function nicCode(values: RegisterFormValues, currentYear: number): string | undefined {
  const result = parseNic(values.nic, currentYear);
  return result.ok ? undefined : result.reason;
}

function nameCode({ fullName }: RegisterFormValues): string | undefined {
  // Counted in code points, as the server's `.min()` / `.max()` do (the parity test checks this).
  const length = [...fullName.trim()].length;
  if (length < 2) return 'NAME_REQUIRED';
  return length > MAX_NAME_LENGTH ? 'NAME_TOO_LONG' : undefined;
}

function addressCode({ addressLine }: RegisterFormValues): string | undefined {
  return [...addressLine.trim()].length > MAX_ADDRESS_LENGTH ? 'ADDRESS_TOO_LONG' : undefined;
}

function locationCode({ lat, lng }: RegisterFormValues): string | undefined {
  if (lat.trim() === '' && lng.trim() === '') return 'LOCATION_REQUIRED';
  const valid = within(coordinate(lat), 90) && within(coordinate(lng), 180);
  return valid ? undefined : 'LOCATION_INVALID';
}

function emailCode({ email, emailOptIn }: RegisterFormValues): string | undefined {
  const address = blankToUndefined(email);
  if (address === undefined) return emailOptIn ? 'EMAIL_REQUIRED_FOR_OPT_IN' : undefined;
  return address.length <= MAX_EMAIL_LENGTH && EMAIL.test(address) ? undefined : 'EMAIL_INVALID';
}

/** The first problem of each field, by the rules the server applies (`registerSchema`). */
export function validate(values: RegisterFormValues, currentYear: number): FieldCodes {
  const codes: FieldCodes = {
    nic: nicCode(values, currentYear),
    fullName: nameCode(values),
    phone: normalizePhone(phoneForRequest(values.phone)) ? undefined : 'PHONE_INVALID',
    password: checkPassword(values.password),
    district: DISTRICTS.some((district) => district === values.district)
      ? undefined
      : 'DISTRICT_INVALID',
    preferredLanguage: LANGUAGES.includes(values.preferredLanguage)
      ? undefined
      : 'LANGUAGE_INVALID',
    location: locationCode(values),
    addressLine: addressCode(values),
    email: emailCode(values),
  };
  return Object.fromEntries(Object.entries(codes).filter(([, code]) => code !== undefined));
}

export interface RequestContext {
  currentYear: number;
  /** A per-install marker for push; see `deviceToken.ts`. */
  deviceToken?: string;
  /** Set when the citizen keeps the district they chose although their pin sits elsewhere. */
  confirmDistrictMismatch: boolean;
}

/** Fields the server accepts only when given: a blank address or e-mail is simply left out. */
function optionalFields(values: RegisterFormValues, deviceToken: string | undefined) {
  const addressLine = blankToUndefined(values.addressLine);
  const email = blankToUndefined(values.email);
  return {
    ...(addressLine === undefined ? {} : { addressLine }),
    ...(email === undefined ? {} : { email }),
    ...(deviceToken === undefined ? {} : { deviceToken }),
  };
}

/**
 * What the API receives, or undefined while the form still has a problem. Validation and building
 * live together so a request can never be made from values that were not checked.
 */
export function buildRequest(
  values: RegisterFormValues,
  context: RequestContext,
): RegisterRequest | undefined {
  const lat = coordinate(values.lat);
  const lng = coordinate(values.lng);
  const { district } = values;
  if (Object.keys(validate(values, context.currentYear)).length > 0) return undefined;
  if (district === '' || lat === undefined || lng === undefined) return undefined;
  return {
    nic: values.nic.trim(),
    fullName: values.fullName.trim(),
    phone: phoneForRequest(values.phone),
    password: values.password,
    homeLocation: { lat, lng },
    district,
    preferredLanguage: values.preferredLanguage,
    whatsappOptIn: values.whatsappOptIn,
    emailOptIn: values.emailOptIn,
    confirmDistrictMismatch: context.confirmDistrictMismatch,
    ...optionalFields(values, context.deviceToken),
  };
}

/** Errors the server raised for a specific field (400 `fields`, or a known 409/422 code). */
const FIELD_FOR_CODE: Record<string, FieldName> = {
  NIC_ALREADY_REGISTERED: 'nic',
  PHONE_ALREADY_REGISTERED: 'phone',
  LOCATION_OUTSIDE_SRI_LANKA: 'location',
};

const KNOWN_FIELDS: readonly FieldName[] = [
  'nic',
  'fullName',
  'phone',
  'password',
  'preferredLanguage',
  'district',
  'addressLine',
  'email',
];

/** The visible field a server field path (`homeLocation.lat`, `phone`) belongs to. */
function fieldFor(path: string): FieldName | undefined {
  const [first] = path.split('.');
  if (first === 'homeLocation') return 'location';
  return KNOWN_FIELDS.find((name) => name === first);
}

export function serverFieldCodes(code: string, fields: readonly FieldError[]): FieldCodes {
  const codes: FieldCodes = {};
  const direct = FIELD_FOR_CODE[code];
  if (direct) codes[direct] = code;
  for (const { field, code: fieldCode } of fields) {
    const name = fieldFor(field);
    if (name && !codes[name]) codes[name] = fieldCode;
  }
  return codes;
}

import { registerSchema, type RegisterRequest } from '@contracts/auth';
import type { District, Language } from '@contracts/enums';
import type { FieldError } from '@contracts/api';

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

/** Error *codes* by field. The page translates them, so the same code reads right in every language. */
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

/** A blank box is "not given" (undefined); anything else that is not a number becomes NaN and fails. */
const coordinate = (text: string): number | undefined => {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : Number(trimmed);
};

const blankToUndefined = (text: string): string | undefined =>
  text.trim() === '' ? undefined : text.trim();

const NATIONAL_MOBILE = /^7\d{8}$/;

/**
 * The phone box shows "+94" in front, so people type the rest ("77 123 4567"). That is completed to
 * the international form; anything else ("077 123 4567", "+94 77 …") is sent as typed and the same
 * schema the server uses decides whether it is a Sri Lankan mobile number.
 */
export function phoneForRequest(typed: string): string {
  const compact = typed.replace(/[\s\-()]/g, '');
  return NATIONAL_MOBILE.test(compact) ? `+94${compact}` : typed;
}

/** Builds what the API receives, from what the person typed. */
export function toRequest(values: RegisterFormValues, confirmDistrictMismatch: boolean): unknown {
  const lat = coordinate(values.lat);
  const lng = coordinate(values.lng);
  return {
    nic: values.nic,
    fullName: values.fullName,
    phone: phoneForRequest(values.phone),
    password: values.password,
    preferredLanguage: values.preferredLanguage,
    district: values.district,
    homeLocation: lat === undefined && lng === undefined ? undefined : { lat, lng },
    addressLine: blankToUndefined(values.addressLine),
    whatsappOptIn: values.whatsappOptIn,
    emailOptIn: values.emailOptIn,
    email: blankToUndefined(values.email),
    confirmDistrictMismatch,
  } satisfies Record<string, unknown>;
}

const MACHINE_CODE = /^[A-Z][A-Z0-9_]+$/;

function fieldFor(path: readonly PropertyKey[]): FieldName | undefined {
  const [first] = path;
  if (first === 'homeLocation') return 'location';
  const known: FieldName[] = [
    'nic',
    'fullName',
    'phone',
    'password',
    'preferredLanguage',
    'district',
    'addressLine',
    'email',
  ];
  return known.find((name) => name === first);
}

/** Turns one schema issue into the code shown to the person (location problems are described in plain terms). */
function codeFor(field: FieldName, message: string, locationMissing: boolean): string {
  if (field === 'location') return locationMissing ? 'LOCATION_REQUIRED' : 'LOCATION_INVALID';
  return MACHINE_CODE.test(message) && message !== 'INVALID_TYPE' ? message : 'REQUIRED';
}

/**
 * Checks the form with the very schema the server uses, so the browser and the API can never
 * disagree about what a valid registration is. Returns one error code per field.
 */
export function validate(values: RegisterFormValues): FieldCodes {
  const result = registerSchema.safeParse(toRequest(values, false) as RegisterRequest);
  if (result.success) return {};
  const locationMissing = values.lat.trim() === '' && values.lng.trim() === '';
  const codes: FieldCodes = {};
  for (const issue of result.error.issues) {
    const field = fieldFor(issue.path);
    if (field && !codes[field]) codes[field] = codeFor(field, issue.message, locationMissing);
  }
  return codes;
}

/** Errors the server raised for a specific field (400 `fields`, or a known 409/422 code). */
const FIELD_FOR_CODE: Record<string, FieldName> = {
  NIC_ALREADY_REGISTERED: 'nic',
  PHONE_ALREADY_REGISTERED: 'phone',
  LOCATION_OUTSIDE_SRI_LANKA: 'location',
};

export function serverFieldCodes(code: string, fields: readonly FieldError[]): FieldCodes {
  const codes: FieldCodes = {};
  const direct = FIELD_FOR_CODE[code];
  if (direct) codes[direct] = code;
  for (const { field, code: fieldCode } of fields) {
    const name = fieldFor(field.split('.'));
    if (name && !codes[name]) codes[name] = fieldCode;
  }
  return codes;
}

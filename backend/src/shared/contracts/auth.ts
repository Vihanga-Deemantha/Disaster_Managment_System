/**
 * Auth request/response contracts shared by the API and the web app (master plan §7.1.10).
 * Field-level problems are reported as machine-readable codes so the UI can translate them.
 */
import { z } from 'zod';
import {
  DISTRICTS,
  LANGUAGES,
  type District,
  type Language,
  type OrganizationType,
  type Role,
} from './enums';
import {
  checkPassword,
  normalizeNic,
  normalizePhone,
  parseNic,
  type PasswordRejection,
} from './identity';

const trimmed = (max: number) => z.string().trim().max(max);

const nicField = trimmed(20).transform((value, ctx) => {
  const result = parseNic(value);
  if (!result.ok) {
    ctx.addIssue({ code: 'custom', message: result.reason });
    return z.NEVER;
  }
  return normalizeNic(value);
});

const phoneField = trimmed(30).transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'PHONE_INVALID' });
    return z.NEVER;
  }
  return phone;
});

/** Password policy as a reusable field (registration and password change). */
export const passwordField = z.string().superRefine((value, ctx) => {
  const rejection: PasswordRejection | undefined = checkPassword(value);
  if (rejection) ctx.addIssue({ code: 'custom', message: rejection });
});

const geoPointSchema = z.object({
  lat: z.number().min(-90, 'LOCATION_INVALID').max(90, 'LOCATION_INVALID'),
  lng: z.number().min(-180, 'LOCATION_INVALID').max(180, 'LOCATION_INVALID'),
});

export const registerSchema = z
  .object({
    nic: nicField,
    fullName: z.string().trim().min(2, 'NAME_REQUIRED').max(100, 'NAME_TOO_LONG'),
    phone: phoneField,
    password: passwordField,
    homeLocation: geoPointSchema,
    district: z.enum(DISTRICTS, 'DISTRICT_INVALID'),
    preferredLanguage: z.enum(LANGUAGES, 'LANGUAGE_INVALID'),
    addressLine: z.string().trim().max(200, 'ADDRESS_TOO_LONG').optional(),
    deviceToken: z.string().trim().min(1).max(512).optional(),
    whatsappOptIn: z.boolean().default(false),
    emailOptIn: z.boolean().default(false),
    email: z.email('EMAIL_INVALID').max(254, 'EMAIL_INVALID').optional(),
    /** Set when the citizen keeps the district they chose although their pin sits elsewhere. */
    confirmDistrictMismatch: z.boolean().default(false),
  })
  .refine((value) => !value.emailOptIn || value.email !== undefined, {
    path: ['email'],
    message: 'EMAIL_REQUIRED_FOR_OPT_IN',
    // Zod skips a cross-field check when any other field failed, so a citizen with several mistakes
    // would only hear about this one after fixing the rest. Report it alongside the others instead
    // (unless the email field already has its own problem, which would only duplicate it).
    when: ({ value, issues }) =>
      typeof value === 'object' &&
      value !== null &&
      !issues.some((issue) => issue.path?.[0] === 'email'),
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'IDENTIFIER_REQUIRED').max(254, 'IDENTIFIER_INVALID'),
  password: z.string().min(1, 'PASSWORD_REQUIRED').max(128, 'PASSWORD_TOO_LONG'),
});

export const reauthSchema = z.object({
  password: z.string().min(1, 'PASSWORD_REQUIRED').max(128, 'PASSWORD_TOO_LONG'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'PASSWORD_REQUIRED').max(128, 'PASSWORD_TOO_LONG'),
  newPassword: passwordField,
});

/** What the browser sends to `POST /api/auth/register`. */
export type RegisterRequest = z.input<typeof registerSchema>;
/** What the server works with after validation and normalisation. */
export type RegisterInput = z.output<typeof registerSchema>;
export type LoginRequest = z.input<typeof loginSchema>;
export type ReauthRequest = z.input<typeof reauthSchema>;
export type ChangePasswordRequest = z.input<typeof changePasswordSchema>;

/** `GET /api/auth/me` and the body of every successful sign-in. Never contains the NIC itself. */
export interface MeResponse {
  userId: string;
  role: Role;
  displayName: string;
  email?: string;
  phone?: string;
  district?: District;
  riverBasinId?: string;
  organizationId?: string;
  organizationType?: OrganizationType;
  preferredLanguage?: Language;
  /** Masked, e.g. `*******89V`. Citizens only. */
  nicMasked?: string;
  /** ISO time the password was last entered in this session (used by step-up checks). */
  authenticatedAt: string;
}

export interface AuthResponse {
  user: MeResponse;
}

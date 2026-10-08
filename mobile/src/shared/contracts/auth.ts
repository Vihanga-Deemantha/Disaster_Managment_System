import type { District, Language, Role } from './enums';

/** `GET /api/auth/me` and the body of every successful sign-in. Never contains the NIC itself. */
export interface MeResponse {
  userId: string;
  role: Role;
  displayName: string;
  email?: string;
  phone?: string;
  district?: District;
  preferredLanguage?: Language;
  /** Masked, e.g. `*******89V`. Citizens only. */
  nicMasked?: string;
  /** ISO time the password was last entered in this session. */
  authenticatedAt: string;
}

export interface AuthResponse {
  user: MeResponse;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

/** What the phone sends to `POST /api/auth/register` (the server validates and normalises it). */
export interface RegisterRequest {
  nic: string;
  fullName: string;
  phone: string;
  password: string;
  homeLocation: { lat: number; lng: number };
  district: District;
  preferredLanguage: Language;
  addressLine?: string;
  /** A per-install marker: it tells UC-1 that this citizen has the app, so push is one of their channels. */
  deviceToken?: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  email?: string;
  /** Set when the citizen keeps the district they chose although their pin sits elsewhere. */
  confirmDistrictMismatch: boolean;
}

export interface FieldError {
  field: string;
  code: string;
  message?: string;
}

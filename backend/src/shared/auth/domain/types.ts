import type { District, Language, OrganizationType, Role } from '../../contracts/enums';
import type { GeoPoint } from '../../geo/GeoPoint';

export type UserStatus = 'ACTIVE' | 'DISABLED';

/** Anyone who can sign in. Staff are provisioned by the seed; citizens register themselves. */
export interface User {
  userId: string;
  role: Role;
  displayName: string;
  /** Staff sign in with email. */
  email?: string;
  /** Citizens and volunteers sign in with phone, normalised to `+947XXXXXXXX`. */
  phone?: string;
  passwordHash: string;
  status: UserStatus;
  organizationId?: string;
  organizationType?: OrganizationType;
  district?: District;
  createdAt: Date;
}

/** What alert targeting needs about a registered citizen. The NIC is stored encrypted. */
export interface CitizenProfile {
  userId: string;
  nicEncrypted: string;
  /** HMAC of the canonical NIC: lets us reject duplicates without decrypting anything. */
  nicHash: string;
  fullName: string;
  /** Copied from the user at registration so targeting never needs a join. */
  phone: string;
  homeLocation: GeoPoint;
  addressLine?: string;
  district: District;
  riverBasinId?: string;
  preferredLanguage: Language;
  deviceToken?: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  email?: string;
}

/**
 * One row per refresh token. A sign-in creates a *family*; every rotation adds a row to the same
 * family, so a replayed old token identifies the whole family to revoke.
 */
export interface RefreshSession {
  sessionId: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  createdAt: Date;
  /** Idle expiry of this token, never later than `absoluteExpiresAt`. */
  expiresAt: Date;
  /** Hard cap for the whole family, however often it is rotated. */
  absoluteExpiresAt: Date;
  /** When the password was last entered for this sign-in (step-up, BR3). */
  authenticatedAt: Date;
  rotatedAt?: Date;
  revokedAt?: Date;
  userAgent: string;
  ip: string;
}

/** Who is calling, recorded on sessions and audit entries. */
export interface ClientInfo {
  ip: string;
  userAgent: string;
}

/** What a verified access token tells a route handler. Scope always comes from here, never the client. */
export interface AuthContext {
  userId: string;
  role: Role;
  /** The refresh-token family of this sign-in. */
  sessionId: string;
  /** When the password was last entered (drives `requireRecentAuth`). */
  authenticatedAt: Date;
  district?: District;
  riverBasinId?: string;
  organizationId?: string;
  organizationType?: OrganizationType;
}

import type { AuthContext, CitizenProfile, RefreshSession, User } from '../domain/types';

/** A unique value (phone, email, NIC hash) is already taken. Repositories throw this, not driver errors. */
export class DuplicateError extends Error {
  constructor(readonly field: 'phone' | 'email' | 'nicHash') {
    super(`Duplicate ${field}`);
    this.name = 'DuplicateError';
  }
}

export interface UserRepository {
  findById(userId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  /** @throws DuplicateError when the phone or email is taken. */
  create(user: User): Promise<void>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  /** Compensation when the second half of a registration fails. */
  delete(userId: string): Promise<void>;
}

export interface CitizenProfileRepository {
  /** @throws DuplicateError('nicHash') when this NIC is already registered. */
  create(profile: CitizenProfile): Promise<void>;
  existsByNicHash(nicHash: string): Promise<boolean>;
  findByUserId(userId: string): Promise<CitizenProfile | null>;
}

export interface RefreshSessionRepository {
  insert(session: RefreshSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  /** Compare-and-set: true only for the one caller that moves the row from "current" to "rotated". */
  markRotated(sessionId: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
  touchAuthenticatedAt(familyId: string, at: Date): Promise<void>;
}

export interface LoginThrottleState {
  failures: number;
  lastFailedAt: Date;
}

/** Counts failures per identifier, whether or not an account exists, so the response never reveals it. */
export interface LoginThrottleRepository {
  get(key: string): Promise<LoginThrottleState | null>;
  recordFailure(key: string, at: Date): Promise<void>;
  reset(key: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface AccessTokenService {
  sign(context: AuthContext): SignedAccessToken;
  /** @throws UnauthorizedError `TOKEN_EXPIRED` or `UNAUTHENTICATED`. */
  verify(token: string): AuthContext;
}

/** Opaque refresh tokens: only a hash is stored, so a database leak cannot be replayed. */
export interface RefreshTokenIssuer {
  generate(): string;
  hash(token: string): string;
}

export interface NicProtector {
  /** Keyed hash of the canonical 12-digit NIC: the uniqueness lookup, safe to store and compare. */
  hash(canonicalNic: string): string;
  /** Reversible encryption of the NIC as typed (needed only to show a masked value back). */
  encrypt(nic: string): string;
  decrypt(encrypted: string): string;
}

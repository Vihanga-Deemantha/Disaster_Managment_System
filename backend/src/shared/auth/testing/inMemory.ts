import { createHash } from 'node:crypto';
import { pointInRing, type GeoPoint } from '../../geo/GeoPoint';
import type { RiverBasinLocator } from '../../geo/RiverBasin';
import {
  DuplicateError,
  type CitizenProfileRepository,
  type LoginThrottleRepository,
  type LoginThrottleState,
  type NicProtector,
  type PasswordHasher,
  type RefreshSessionRepository,
  type RefreshTokenIssuer,
  type UserRepository,
} from '../application/ports';
import type { CitizenProfile, RefreshSession, User } from '../domain/types';

/** In-memory auth ports for fast, deterministic tests. Same contracts as the Mongo adapters. */

export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();

  async findById(userId: string): Promise<User | null> {
    return this.copyOf(this.users.get(userId));
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.copyOf([...this.users.values()].find((user) => user.email === email));
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.copyOf([...this.users.values()].find((user) => user.phone === phone));
  }

  async create(user: User): Promise<void> {
    if (user.phone && (await this.findByPhone(user.phone))) throw new DuplicateError('phone');
    if (user.email && (await this.findByEmail(user.email))) throw new DuplicateError('email');
    this.users.set(user.userId, { ...user });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.passwordHash = passwordHash;
  }

  async delete(userId: string): Promise<void> {
    this.users.delete(userId);
  }

  private copyOf(user: User | undefined): User | null {
    return user ? { ...user } : null;
  }
}

export class InMemoryCitizenProfileRepository implements CitizenProfileRepository {
  readonly profiles = new Map<string, CitizenProfile>();

  async create(profile: CitizenProfile): Promise<void> {
    if (await this.existsByNicHash(profile.nicHash)) throw new DuplicateError('nicHash');
    this.profiles.set(profile.userId, { ...profile });
  }

  async existsByNicHash(nicHash: string): Promise<boolean> {
    return [...this.profiles.values()].some((profile) => profile.nicHash === nicHash);
  }

  async findByUserId(userId: string): Promise<CitizenProfile | null> {
    const profile = this.profiles.get(userId);
    return profile ? { ...profile } : null;
  }
}

export class InMemoryRefreshSessionRepository implements RefreshSessionRepository {
  readonly sessions: RefreshSession[] = [];

  async insert(session: RefreshSession): Promise<void> {
    this.sessions.push({ ...session });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);
    return session ? { ...session } : null;
  }

  async markRotated(sessionId: string, at: Date): Promise<boolean> {
    const session = this.sessions.find((candidate) => candidate.sessionId === sessionId);
    if (!session || session.rotatedAt || session.revokedAt) return false;
    session.rotatedAt = at;
    return true;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    for (const session of this.sessions) {
      if (session.familyId === familyId && !session.revokedAt) session.revokedAt = at;
    }
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    for (const session of this.sessions) {
      if (session.userId === userId && !session.revokedAt) session.revokedAt = at;
    }
  }

  async touchAuthenticatedAt(familyId: string, at: Date): Promise<void> {
    for (const session of this.sessions) {
      if (session.familyId === familyId && !session.revokedAt) session.authenticatedAt = at;
    }
  }

  inFamily(familyId: string): RefreshSession[] {
    return this.sessions.filter((session) => session.familyId === familyId);
  }
}

export class InMemoryLoginThrottleRepository implements LoginThrottleRepository {
  readonly states = new Map<string, LoginThrottleState>();

  async get(key: string): Promise<LoginThrottleState | null> {
    const state = this.states.get(key);
    return state ? { ...state } : null;
  }

  async recordFailure(key: string, at: Date): Promise<void> {
    const failures = (this.states.get(key)?.failures ?? 0) + 1;
    this.states.set(key, { failures, lastFailedAt: at });
  }

  async reset(key: string): Promise<void> {
    this.states.delete(key);
  }
}

const fastDigest = (password: string): string =>
  `fake-hash:${createHash('sha256').update(password).digest('hex')}`;

/**
 * Fast and unsalted on purpose (tests would crawl with real argon2), but opaque: the stored value
 * never contains the password, so "the plaintext is never stored" is a real assertion.
 * Counts verifications so tests can check that every login attempt costs one.
 */
export class FakePasswordHasher implements PasswordHasher {
  readonly verifications: string[] = [];

  async hash(password: string): Promise<string> {
    return fastDigest(password);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    this.verifications.push(password);
    return hash === fastDigest(password);
  }
}

export class SequentialRefreshTokenIssuer implements RefreshTokenIssuer {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `refresh-token-${this.counter}`;
  }

  hash(token: string): string {
    return `sha:${token}`;
  }
}

export class FakeNicProtector implements NicProtector {
  hash(canonicalNic: string): string {
    return `nic-hash:${canonicalNic}`;
  }

  encrypt(nic: string): string {
    return `enc:${nic}`;
  }

  decrypt(encrypted: string): string {
    return encrypted.replace(/^enc:/, '');
  }
}

export class StaticRiverBasinLocator implements RiverBasinLocator {
  constructor(private readonly basinId?: string) {}

  async locate(_point: GeoPoint): Promise<string | undefined> {
    return this.basinId;
  }
}

/** Locates a basin by testing the point against simple rectangular-or-polygon rings. */
export class RingRiverBasinLocator implements RiverBasinLocator {
  constructor(private readonly basins: Record<string, readonly GeoPoint[]>) {}

  async locate(point: GeoPoint): Promise<string | undefined> {
    return Object.entries(this.basins).find(([, ring]) => pointInRing(point, ring))?.[0];
  }
}

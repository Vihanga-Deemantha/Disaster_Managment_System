import type { MeResponse, RegisterInput } from '../../contracts/auth';
import { PUBLIC_ROLES } from '../../contracts/enums';
import { maskNic, normalizePhone, toCanonicalNic } from '../../contracts/identity';
import {
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableError,
} from '../../errors/DomainError';
import { isWithinSriLanka } from '../../geo/GeoPoint';
import type { DistrictLocator } from '../../geo/districts';
import type { AuditLog } from '../../audit/AuditLog';
import type { IdGenerator } from '../../ids/IdGenerator';
import type { Clock } from '../../time/Clock';
import { absoluteLifetimeMs, loginDelaySeconds, type SessionPolicy } from '../domain/policies';
import type {
  AuthContext,
  CitizenProfile,
  ClientInfo,
  RefreshSession,
  User,
} from '../domain/types';
import type { AccountProvisioner } from './AccountProvisioner';
import {
  DuplicateError,
  type AccessTokenService,
  type CitizenProfileRepository,
  type LoginThrottleRepository,
  type NicProtector,
  type PasswordHasher,
  type RefreshSessionRepository,
  type RefreshTokenIssuer,
  type UserRepository,
} from './ports';

export interface AuthDeps {
  users: UserRepository;
  profiles: CitizenProfileRepository;
  sessions: RefreshSessionRepository;
  throttle: LoginThrottleRepository;
  hasher: PasswordHasher;
  accessTokens: AccessTokenService;
  refreshTokens: RefreshTokenIssuer;
  nic: NicProtector;
  districts: DistrictLocator;
  provisioner: AccountProvisioner;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditLog;
  policy: SessionPolicy;
}

export interface SessionTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthResult {
  tokens: SessionTokens;
  user: MeResponse;
}

export interface ReauthResult {
  accessToken: string;
  accessExpiresAt: Date;
  user: MeResponse;
}

interface Principal {
  user: User;
  profile: CitizenProfile | null;
}

interface IssueArgs {
  principal: Principal;
  familyId: string;
  authenticatedAt: Date;
  absoluteExpiresAt: Date;
  client: ClientInfo;
  now: Date;
}

const invalidCredentials = (): UnauthorizedError =>
  new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid credentials.');

const sessionError = (code: string, message: string): UnauthorizedError =>
  new UnauthorizedError(code, message);

const isCitizenRole = (user: User): boolean =>
  (PUBLIC_ROLES as readonly string[]).includes(user.role);

/** Scope claims for the token: citizens by home location, staff by their provisioned scope. */
function scopeOf({ user, profile }: Principal) {
  return {
    district: profile?.district ?? user.district,
    riverBasinId: profile?.riverBasinId,
    organizationId: user.organizationId,
    organizationType: user.organizationType,
  };
}

function toContext(principal: Principal, familyId: string, authenticatedAt: Date): AuthContext {
  return {
    userId: principal.user.userId,
    role: principal.user.role,
    sessionId: familyId,
    authenticatedAt,
    ...scopeOf(principal),
  };
}

const conflictFor = (field: DuplicateError['field']): ConflictError => {
  const messages = {
    nicHash: ['NIC_ALREADY_REGISTERED', 'This NIC is already registered.'],
    phone: ['PHONE_ALREADY_REGISTERED', 'This phone number is already registered.'],
    email: ['EMAIL_ALREADY_REGISTERED', 'This email is already registered.'],
  } as const;
  const [code, message] = messages[field];
  return new ConflictError(code, message);
};

function normalizeIdentifier(raw: string): { kind: 'email' | 'phone'; value: string } {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) return { kind: 'email', value: trimmed.toLowerCase() };
  return { kind: 'phone', value: normalizePhone(trimmed) ?? trimmed };
}

/**
 * Registration, sign-in, token rotation, step-up re-authentication and sign-out
 * (master plan §7.1). It talks only to ports; `composition.ts` wires the real adapters.
 */
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly deps: AuthDeps) {}

  /** Citizen self-registration (§7.1.2). Signs the new citizen in. */
  async register(input: RegisterInput, client: ClientInfo): Promise<AuthResult> {
    this.assertLocationMatchesDistrict(input);
    await this.assertNotRegistered(input);
    const passwordHash = await this.deps.hasher.hash(input.password);
    const { user, profile } = await this.createCitizen(input, passwordHash);
    await this.record('auth.register', { user, client });
    return this.startSession({ user, profile }, client);
  }

  /** Sign-in with progressive delay (§7.1.4) and one generic failure for every cause. */
  async login(
    input: { identifier: string; password: string },
    client: ClientInfo,
  ): Promise<AuthResult> {
    const identifier = normalizeIdentifier(input.identifier);
    const throttleKey = `login:${identifier.value}`;
    await this.assertNotThrottled(throttleKey);
    const user = await this.findUser(identifier);
    const verified = await this.verifiedUser(user, input.password);
    if (!verified) {
      await this.deps.throttle.recordFailure(throttleKey, this.deps.clock.now());
      await this.record('auth.login.failure', { user, client, details: { kind: identifier.kind } });
      throw invalidCredentials();
    }
    await this.deps.throttle.reset(throttleKey);
    await this.record('auth.login.success', { user: verified, client });
    return this.startSession(await this.loadPrincipal(verified), client);
  }

  /**
   * Rotates the refresh token. An old token presented again means it was copied, so the whole
   * sign-in (family) is revoked and the person must sign in again (§7.1.3).
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<AuthResult> {
    const now = this.deps.clock.now();
    const session = await this.deps.sessions.findByTokenHash(
      this.deps.refreshTokens.hash(refreshToken),
    );
    if (!session) throw sessionError('SESSION_INVALID', 'The session is not valid.');
    await this.assertRefreshable(session, client, now);
    const principal = await this.loadActivePrincipal(session, now);
    if (!(await this.deps.sessions.markRotated(session.sessionId, now))) {
      throw sessionError('TOKEN_ROTATED', 'The session was just refreshed; retry the request.');
    }
    const tokens = await this.issueTokens({
      principal,
      familyId: session.familyId,
      authenticatedAt: session.authenticatedAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      client,
      now,
    });
    return { tokens, user: this.toMe(principal, session.authenticatedAt) };
  }

  /** Revokes the sign-in server-side. Works from either the refresh cookie or a valid access token. */
  async logout(
    target: { refreshToken?: string; context?: AuthContext },
    client: ClientInfo,
  ): Promise<void> {
    const familyId = target.context?.sessionId ?? (await this.familyOf(target.refreshToken));
    if (!familyId) return;
    await this.deps.sessions.revokeFamily(familyId, this.deps.clock.now());
    await this.record('auth.logout', { userId: target.context?.userId, client });
  }

  /**
   * Step-up (BR3): re-entering the password marks this sign-in as freshly authenticated, which is
   * what `requireRecentAuth` checks before a mass alert can be issued.
   */
  async reauth(context: AuthContext, password: string, client: ClientInfo): Promise<ReauthResult> {
    const user = await this.confirmPassword(context, password, 'reauth', client);
    const now = this.deps.clock.now();
    await this.deps.sessions.touchAuthenticatedAt(context.sessionId, now);
    const principal = await this.loadPrincipal(user);
    const access = this.deps.accessTokens.sign(toContext(principal, context.sessionId, now));
    await this.record('auth.reauth.success', { user, client });
    return {
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      user: this.toMe(principal, now),
    };
  }

  /** Changing the password signs the person out everywhere (§7.1.3). */
  async changePassword(
    context: AuthContext,
    input: { currentPassword: string; newPassword: string },
    client: ClientInfo,
  ): Promise<void> {
    const user = await this.confirmPassword(
      context,
      input.currentPassword,
      'password_change',
      client,
    );
    await this.deps.users.updatePasswordHash(
      user.userId,
      await this.deps.hasher.hash(input.newPassword),
    );
    await this.deps.sessions.revokeAllForUser(user.userId, this.deps.clock.now());
    await this.record('auth.password_change', { user, client });
  }

  async me(context: AuthContext): Promise<MeResponse> {
    const user = await this.deps.users.findById(context.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw sessionError('SESSION_INVALID', 'The account is no longer active.');
    }
    return this.toMe(await this.loadPrincipal(user), context.authenticatedAt);
  }

  // ---- registration helpers ----

  /** The pin must be in Sri Lanka and near the claimed district, unless the citizen confirms (§7.1.2). */
  private assertLocationMatchesDistrict(input: RegisterInput): void {
    if (!isWithinSriLanka(input.homeLocation)) {
      throw new UnprocessableError(
        'LOCATION_OUTSIDE_SRI_LANKA',
        'The location is outside Sri Lanka.',
      );
    }
    if (input.confirmDistrictMismatch) return;
    const nearest = this.deps.districts.nearest(input.homeLocation, 2);
    if (nearest.includes(input.district)) return;
    throw new UnprocessableError(
      'DISTRICT_LOCATION_MISMATCH',
      'Your location looks closer to a different district.',
      { suggestedDistrict: nearest[0] },
    );
  }

  private async assertNotRegistered(input: RegisterInput): Promise<void> {
    if (await this.deps.profiles.existsByNicHash(this.deps.nic.hash(toCanonicalNic(input.nic)))) {
      throw conflictFor('nicHash');
    }
    if (await this.deps.users.findByPhone(input.phone)) throw conflictFor('phone');
  }

  private async createCitizen(input: RegisterInput, passwordHash: string) {
    try {
      return await this.deps.provisioner.createCitizen({
        userId: this.deps.ids.next(),
        role: 'CITIZEN',
        passwordHash,
        nic: input.nic,
        fullName: input.fullName,
        phone: input.phone,
        homeLocation: input.homeLocation,
        addressLine: input.addressLine,
        district: input.district,
        preferredLanguage: input.preferredLanguage,
        deviceToken: input.deviceToken,
        whatsappOptIn: input.whatsappOptIn,
        emailOptIn: input.emailOptIn,
        email: input.email,
      });
    } catch (error) {
      // Two simultaneous registrations can pass the pre-check; the unique index decides.
      throw error instanceof DuplicateError ? conflictFor(error.field) : error;
    }
  }

  // ---- sign-in helpers ----

  private async assertNotThrottled(key: string): Promise<void> {
    const state = await this.deps.throttle.get(key);
    if (!state) return;
    const waitMs =
      loginDelaySeconds(state.failures) * 1000 -
      (this.deps.clock.now().getTime() - state.lastFailedAt.getTime());
    if (waitMs > 0) {
      throw new TooManyRequestsError(
        'LOGIN_THROTTLED',
        'Too many attempts. Try again shortly.',
        Math.ceil(waitMs / 1000),
      );
    }
  }

  private findUser(identifier: { kind: 'email' | 'phone'; value: string }): Promise<User | null> {
    return identifier.kind === 'email'
      ? this.deps.users.findByEmail(identifier.value)
      : this.deps.users.findByPhone(identifier.value);
  }

  /**
   * Returns the user when the password is right, otherwise null. It always performs exactly one hash
   * verification, so unknown and disabled accounts take as long as real ones.
   */
  private async verifiedUser(user: User | null, password: string): Promise<User | null> {
    if (!user || user.status !== 'ACTIVE') {
      // Stryker disable next-line StringLiteral: any text will do, only the cost of one verification counts
      this.dummyHash ??= this.deps.hasher.hash('timing-equaliser');
      await this.deps.hasher.verify(await this.dummyHash, password);
      return null;
    }
    return (await this.deps.hasher.verify(user.passwordHash, password)) ? user : null;
  }

  /** Step-up and password change share one rule: wrong passwords are counted per account. */
  private async confirmPassword(
    context: AuthContext,
    password: string,
    action: 'reauth' | 'password_change',
    client: ClientInfo,
  ): Promise<User> {
    const key = `uid:${context.userId}`;
    await this.assertNotThrottled(key);
    const verified = await this.verifiedUser(
      await this.deps.users.findById(context.userId),
      password,
    );
    if (!verified) {
      await this.deps.throttle.recordFailure(key, this.deps.clock.now());
      await this.record(`auth.${action}.failure`, { userId: context.userId, client });
      throw invalidCredentials();
    }
    await this.deps.throttle.reset(key);
    return verified;
  }

  // ---- session helpers ----

  private async startSession(principal: Principal, client: ClientInfo): Promise<AuthResult> {
    const now = this.deps.clock.now();
    const absoluteMs = absoluteLifetimeMs(principal.user.role, this.deps.policy);
    const tokens = await this.issueTokens({
      principal,
      familyId: this.deps.ids.next(),
      authenticatedAt: now,
      absoluteExpiresAt: new Date(now.getTime() + absoluteMs),
      client,
      now,
    });
    return { tokens, user: this.toMe(principal, now) };
  }

  private async issueTokens(args: IssueArgs): Promise<SessionTokens> {
    const { principal, familyId, authenticatedAt, absoluteExpiresAt, client, now } = args;
    const refreshToken = this.deps.refreshTokens.generate();
    const idleExpiry = now.getTime() + this.deps.policy.idleTtlMs;
    const session: RefreshSession = {
      sessionId: this.deps.ids.next(),
      userId: principal.user.userId,
      familyId,
      tokenHash: this.deps.refreshTokens.hash(refreshToken),
      createdAt: now,
      expiresAt: new Date(Math.min(idleExpiry, absoluteExpiresAt.getTime())),
      absoluteExpiresAt,
      authenticatedAt,
      userAgent: client.userAgent,
      ip: client.ip,
    };
    await this.deps.sessions.insert(session);
    const access = this.deps.accessTokens.sign(toContext(principal, familyId, authenticatedAt));
    return {
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  private async assertRefreshable(
    session: RefreshSession,
    client: ClientInfo,
    now: Date,
  ): Promise<void> {
    if (session.revokedAt) throw sessionError('SESSION_REVOKED', 'The session was signed out.');
    if (session.rotatedAt) return this.rejectReuse(session, client, now);
    if (session.expiresAt.getTime() <= now.getTime()) {
      throw sessionError('SESSION_EXPIRED', 'The session expired. Please sign in again.');
    }
  }

  private async rejectReuse(
    session: RefreshSession,
    client: ClientInfo,
    now: Date,
  ): Promise<never> {
    const sinceRotation = now.getTime() - (session.rotatedAt as Date).getTime();
    if (sinceRotation <= this.deps.policy.reuseGraceMs) {
      throw sessionError('TOKEN_ROTATED', 'The session was just refreshed; retry the request.');
    }
    await this.deps.sessions.revokeFamily(session.familyId, now);
    await this.record('auth.refresh.reuse_detected', { userId: session.userId, client });
    throw sessionError('SESSION_REVOKED', 'The session was signed out for your safety.');
  }

  private async loadActivePrincipal(session: RefreshSession, now: Date): Promise<Principal> {
    const user = await this.deps.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.deps.sessions.revokeFamily(session.familyId, now);
      throw sessionError('SESSION_REVOKED', 'The account is no longer active.');
    }
    return this.loadPrincipal(user);
  }

  private async loadPrincipal(user: User): Promise<Principal> {
    const profile = isCitizenRole(user) ? await this.deps.profiles.findByUserId(user.userId) : null;
    return { user, profile };
  }

  private async familyOf(refreshToken: string | undefined): Promise<string | undefined> {
    if (!refreshToken) return undefined;
    const session = await this.deps.sessions.findByTokenHash(
      this.deps.refreshTokens.hash(refreshToken),
    );
    return session?.familyId;
  }

  private toMe({ user, profile }: Principal, authenticatedAt: Date): MeResponse {
    return {
      userId: user.userId,
      role: user.role,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      ...scopeOf({ user, profile }),
      preferredLanguage: profile?.preferredLanguage,
      nicMasked: profile ? maskNic(this.deps.nic.decrypt(profile.nicEncrypted)) : undefined,
      authenticatedAt: authenticatedAt.toISOString(),
    };
  }

  private async record(
    action: string,
    entry: {
      user?: User | null;
      userId?: string | undefined;
      client: ClientInfo;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.deps.audit.record({
      action,
      actorId: entry.user?.userId ?? entry.userId,
      actorRole: entry.user?.role,
      ip: entry.client.ip,
      userAgent: entry.client.userAgent,
      details: entry.details,
      occurredAt: this.deps.clock.now(),
    });
  }
}

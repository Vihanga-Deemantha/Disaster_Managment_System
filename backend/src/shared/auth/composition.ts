import type { Router } from 'express';
import type { AuditLog } from '../audit/AuditLog';
import type { AppConfig } from '../config/env';
import { CentroidDistrictLocator } from '../geo/districts';
import { MongoRiverBasinLocator } from '../geo/RiverBasin';
import type { IdGenerator } from '../ids/IdGenerator';
import type { Logger } from '../logging/Logger';
import type { Clock } from '../time/Clock';
import { createAuthRouter } from './api/auth.http';
import { createAuthGuards, type AuthGuards } from './api/guards';
import { AccountProvisioner } from './application/AccountProvisioner';
import { AuthService } from './application/AuthService';
import type { CitizenProfileReader } from './application/CitizenProfileReader';
import type { PasswordHasher, UserRepository } from './application/ports';
import { DEFAULT_SESSION_POLICY } from './domain/policies';
import { AesNicProtector } from './infrastructure/AesNicProtector';
import { CryptoRefreshTokenIssuer } from './infrastructure/CryptoRefreshTokenIssuer';
import { JwtAccessTokenService } from './infrastructure/JwtAccessTokenService';
import { MongoCitizenProfileRepository } from './infrastructure/MongoCitizenProfileRepository';
import { MongoLoginThrottleRepository } from './infrastructure/MongoLoginThrottleRepository';
import { MongoRefreshSessionRepository } from './infrastructure/MongoRefreshSessionRepository';
import { MongoUserRepository } from './infrastructure/MongoUserRepository';
import { createPasswordHasher } from './infrastructure/passwordHashers';

export interface AuthDependencies {
  config: AppConfig;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditLog;
  logger: Logger;
}

export interface AuthModule {
  router: Router;
  guards: AuthGuards;
  service: AuthService;
  accounts: AccountProvisioner;
  users: UserRepository;
  hasher: PasswordHasher;
  /** Handed to UC-1 so alert targeting reads registered citizens (never their NIC). */
  citizenProfiles: CitizenProfileReader;
}

/** The MongoDB-backed repositories behind the auth ports. */
function createRepositories() {
  return {
    users: new MongoUserRepository(),
    profiles: new MongoCitizenProfileRepository(),
    sessions: new MongoRefreshSessionRepository(),
    throttle: new MongoLoginThrottleRepository(),
  };
}

/** Passwords, tokens and NICs: everything that touches a secret. */
async function createSecurity({ config, clock, logger }: AuthDependencies) {
  return {
    hasher: await createPasswordHasher({ logger }),
    nic: new AesNicProtector(config.nicEncryptionKey, config.nicHashKey),
    refreshTokens: new CryptoRefreshTokenIssuer(),
    accessTokens: new JwtAccessTokenService({
      secret: config.jwtAccessSecret,
      ttlSeconds: DEFAULT_SESSION_POLICY.accessTtlSeconds,
      clock,
    }),
  };
}

/** The only place concrete auth classes are chosen and wired together. */
export async function composeAuth(deps: AuthDependencies): Promise<AuthModule> {
  const { config, clock, ids, audit } = deps;
  const repos = createRepositories();
  const security = await createSecurity(deps);
  const accounts = new AccountProvisioner(
    repos.users,
    repos.profiles,
    security.nic,
    new MongoRiverBasinLocator(),
    clock,
  );
  const service = new AuthService({
    ...repos,
    ...security,
    districts: new CentroidDistrictLocator(),
    provisioner: accounts,
    clock,
    ids,
    audit,
    policy: DEFAULT_SESSION_POLICY,
  });
  const { accessTokens } = security;
  const guards = createAuthGuards({ accessTokens, clock });
  const router = createAuthRouter({
    service,
    guards,
    accessTokens,
    cookieSecure: config.cookieSecure,
  });
  return {
    router,
    guards,
    service,
    accounts,
    users: repos.users,
    hasher: security.hasher,
    citizenProfiles: repos.profiles,
  };
}

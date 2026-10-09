import { CentroidDistrictLocator } from '../../geo/districts';
import { SequentialIdGenerator } from '../../ids/IdGenerator';
import { FixedClock } from '../../time/Clock';
import { FakeAuditLog } from '../../testing/FakeAuditLog';
import { TEST_JWT_SECRET, TEST_PASSWORD } from '../../testing/constants';
import { createAuthGuards } from '../api/guards';
import {
  AccountProvisioner,
  type CitizenSpec,
  type StaffSpec,
} from '../application/AccountProvisioner';
import { AuthService } from '../application/AuthService';
import { DEFAULT_SESSION_POLICY, type SessionPolicy } from '../domain/policies';
import type { ClientInfo } from '../domain/types';
import { JwtAccessTokenService } from '../infrastructure/JwtAccessTokenService';
import {
  FakeNicProtector,
  FakePasswordHasher,
  InMemoryCitizenProfileRepository,
  InMemoryLoginThrottleRepository,
  InMemoryRefreshSessionRepository,
  InMemoryUserRepository,
  SequentialRefreshTokenIssuer,
  StaticRiverBasinLocator,
} from './inMemory';

export interface AuthHarnessOptions {
  policy?: Partial<SessionPolicy>;
  basinId?: string;
}

/**
 * A fully wired `AuthService` over in-memory ports, a fixed clock and the real JWT service, so tests
 * exercise real token signing and verification while staying fast and deterministic.
 */
export function createAuthHarness(options: AuthHarnessOptions = {}) {
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator('id');
  const audit = new FakeAuditLog();
  const users = new InMemoryUserRepository();
  const profiles = new InMemoryCitizenProfileRepository();
  const sessions = new InMemoryRefreshSessionRepository();
  const throttle = new InMemoryLoginThrottleRepository();
  const hasher = new FakePasswordHasher();
  const nic = new FakeNicProtector();
  const refreshTokens = new SequentialRefreshTokenIssuer();
  const basins = new StaticRiverBasinLocator(options.basinId);
  const policy: SessionPolicy = { ...DEFAULT_SESSION_POLICY, ...options.policy };
  const accessTokens = new JwtAccessTokenService({
    secret: TEST_JWT_SECRET,
    ttlSeconds: policy.accessTtlSeconds,
    clock,
  });
  const provisioner = new AccountProvisioner(users, profiles, nic, basins, clock);
  const service = new AuthService({
    users,
    profiles,
    sessions,
    throttle,
    hasher,
    accessTokens,
    refreshTokens,
    nic,
    districts: new CentroidDistrictLocator(),
    provisioner,
    clock,
    ids,
    audit,
    policy,
  });
  const guards = createAuthGuards({ accessTokens, clock });
  const client: ClientInfo = { ip: '203.0.113.7', userAgent: 'jest-agent' };

  async function addStaff(overrides: Partial<StaffSpec> = {}) {
    return provisioner.createStaff({
      userId: ids.next(),
      role: 'DMC_OFFICER',
      displayName: 'Test DMC Officer',
      email: 'officer@example.test',
      passwordHash: await hasher.hash(TEST_PASSWORD),
      ...overrides,
    });
  }

  async function addCitizen(overrides: Partial<CitizenSpec> = {}) {
    return provisioner.createCitizen({
      userId: ids.next(),
      role: 'CITIZEN',
      nic: '199001234567',
      fullName: 'Test Citizen',
      phone: '+94771234567',
      passwordHash: await hasher.hash(TEST_PASSWORD),
      homeLocation: { lat: 7.0873, lng: 79.9925 },
      district: 'GAMPAHA',
      preferredLanguage: 'SI',
      whatsappOptIn: false,
      emailOptIn: false,
      ...overrides,
    });
  }

  return {
    clock,
    ids,
    audit,
    users,
    profiles,
    sessions,
    throttle,
    hasher,
    nic,
    refreshTokens,
    accessTokens,
    provisioner,
    service,
    guards,
    client,
    addStaff,
    addCitizen,
  };
}

export type AuthHarness = ReturnType<typeof createAuthHarness>;

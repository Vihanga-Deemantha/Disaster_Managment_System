import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import type { GeoPoint } from '../../geo/GeoPoint';
import { MongoRiverBasinLocator, RiverBasinModel } from '../../geo/RiverBasin';
import { clearDatabase, connectTestMongo } from '../../testing/mongo';
import { DuplicateError } from '../application/ports';
import type { CitizenProfile, RefreshSession, User } from '../domain/types';
import {
  CitizenProfileModel,
  LoginThrottleModel,
  RefreshSessionModel,
  UserModel,
} from '../infrastructure/models';
import { MongoCitizenProfileRepository } from '../infrastructure/MongoCitizenProfileRepository';
import { MongoLoginThrottleRepository } from '../infrastructure/MongoLoginThrottleRepository';
import { MongoRefreshSessionRepository } from '../infrastructure/MongoRefreshSessionRepository';
import { MongoUserRepository, asDuplicateError } from '../infrastructure/MongoUserRepository';

let teardown: () => Promise<void>;
const users = new MongoUserRepository();
const profiles = new MongoCitizenProfileRepository();
const sessions = new MongoRefreshSessionRepository();
const throttle = new MongoLoginThrottleRepository();
const NOW = new Date('2026-10-07T09:00:00.000Z');

beforeAll(async () => {
  teardown = await connectTestMongo();
  await Promise.all(
    [UserModel, CitizenProfileModel, RefreshSessionModel, LoginThrottleModel, RiverBasinModel].map(
      (model) => model.init(),
    ),
  );
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());

const staff = (overrides: Partial<User> = {}): User => ({
  userId: 'u-staff',
  role: 'DMC_OFFICER',
  displayName: 'DMC Officer',
  email: 'officer@example.test',
  passwordHash: '$argon2id$stub',
  status: 'ACTIVE',
  createdAt: NOW,
  ...overrides,
});

const citizenUser = (overrides: Partial<User> = {}): User => ({
  userId: 'u-citizen',
  role: 'CITIZEN',
  displayName: 'Citizen',
  phone: '+94771234567',
  passwordHash: '$argon2id$stub',
  status: 'ACTIVE',
  district: 'GAMPAHA',
  createdAt: NOW,
  ...overrides,
});

const profile = (overrides: Partial<CitizenProfile> = {}): CitizenProfile => ({
  userId: 'u-citizen',
  nicEncrypted: 'iv.tag.cipher',
  nicHash: 'hash-1',
  fullName: 'Citizen',
  phone: '+94771234567',
  homeLocation: { lat: 7.0873, lng: 79.9925 },
  addressLine: '12 Temple Road',
  district: 'GAMPAHA',
  riverBasinId: 'basin-kelani',
  preferredLanguage: 'SI',
  deviceToken: 'device-1',
  whatsappOptIn: true,
  emailOptIn: false,
  email: 'c@example.test',
  ...overrides,
});

const session = (overrides: Partial<RefreshSession> = {}): RefreshSession => ({
  sessionId: 's-1',
  userId: 'u-staff',
  familyId: 'f-1',
  tokenHash: 'th-1',
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 3_600_000),
  absoluteExpiresAt: new Date(NOW.getTime() + 7_200_000),
  authenticatedAt: NOW,
  userAgent: 'jest',
  ip: '203.0.113.7',
  ...overrides,
});

describe('MongoUserRepository', () => {
  it('round-trips every field and finds a user by id, email or phone', async () => {
    const full = staff({
      district: 'GAMPAHA',
      organizationId: 'org-1',
      organizationType: 'NGO',
      role: 'NGO_MANAGER',
    });
    await users.create(full);
    await users.create(citizenUser());

    expect(await users.findById('u-staff')).toEqual(full);
    expect(await users.findByEmail('officer@example.test')).toEqual(full);
    expect((await users.findByPhone('+94771234567'))?.userId).toBe('u-citizen');
  });

  it('returns null for an account that does not exist', async () => {
    expect(await users.findById('nope')).toBeNull();
    expect(await users.findByEmail('nobody@example.test')).toBeNull();
    expect(await users.findByPhone('+94770000000')).toBeNull();
  });

  it('lower-cases and trims emails on the way in', async () => {
    await users.create(staff({ email: '  Mixed.Case@Example.TEST ' }));

    expect((await users.findByEmail('mixed.case@example.test'))?.userId).toBe('u-staff');
  });

  it('enforces unique phone numbers and emails with DuplicateError', async () => {
    await users.create(staff());
    await users.create(citizenUser());

    await expect(users.create(staff({ userId: 'u-other' }))).rejects.toEqual(
      new DuplicateError('email'),
    );
    await expect(users.create(citizenUser({ userId: 'u-other' }))).rejects.toEqual(
      new DuplicateError('phone'),
    );
  });

  it('lets many staff share "no phone" and many citizens share "no email" (partial indexes)', async () => {
    await users.create(staff({ userId: 'a', email: 'a@example.test' }));
    await users.create(staff({ userId: 'b', email: 'b@example.test' }));
    await users.create(citizenUser({ userId: 'c', phone: '+94771111111' }));
    await users.create(citizenUser({ userId: 'd', phone: '+94772222222' }));

    expect(await UserModel.countDocuments()).toBe(4);
  });

  it('updates a password hash and deletes a user', async () => {
    await users.create(staff());

    await users.updatePasswordHash('u-staff', '$argon2id$new');
    expect((await users.findById('u-staff'))?.passwordHash).toBe('$argon2id$new');

    await users.delete('u-staff');
    expect(await users.findById('u-staff')).toBeNull();
  });

  it('asDuplicateError passes unrelated errors and unknown duplicate keys through unchanged', () => {
    const plain = new Error('network');
    const unknownKey = Object.assign(new Error('dup'), { code: 11000, keyPattern: { _id: 1 } });
    const noPattern = Object.assign(new Error('dup'), { code: 11000 });

    expect(asDuplicateError(plain)).toBe(plain);
    expect(asDuplicateError(unknownKey)).toBe(unknownKey);
    expect(asDuplicateError(noPattern)).toBe(noPattern);
    expect(asDuplicateError(undefined)).toBeUndefined();
  });
});

describe('MongoCitizenProfileRepository', () => {
  it('round-trips a profile including its GeoJSON location', async () => {
    await profiles.create(profile());

    expect(await profiles.findByUserId('u-citizen')).toEqual(profile());
    expect(await profiles.existsByNicHash('hash-1')).toBe(true);
    expect(await profiles.existsByNicHash('other')).toBe(false);
    expect(await profiles.findByUserId('nobody')).toBeNull();
  });

  it('stores the location as [lng, lat] and indexes it 2dsphere', async () => {
    await profiles.create(profile());

    const raw = await CitizenProfileModel.findById('u-citizen').lean();
    expect(raw?.homeLocation).toEqual({ type: 'Point', coordinates: [79.9925, 7.0873] });
    const indexes = await CitizenProfileModel.collection.indexes();
    expect(indexes.some((index) => index.key.homeLocation === '2dsphere')).toBe(true);
  });

  it('enforces one profile per NIC with DuplicateError', async () => {
    await profiles.create(profile());

    await expect(profiles.create(profile({ userId: 'u-2' }))).rejects.toEqual(
      new DuplicateError('nicHash'),
    );
  });

  describe('CitizenProfileReader (what UC-1 reads)', () => {
    beforeEach(async () => {
      await profiles.create(
        profile({
          userId: 'g1',
          nicHash: 'h1',
          district: 'GAMPAHA',
          riverBasinId: 'basin-kelani',
          homeLocation: { lat: 7.1, lng: 80.0 },
        }),
      );
      await profiles.create(
        profile({
          userId: 'g2',
          nicHash: 'h2',
          district: 'GAMPAHA',
          riverBasinId: undefined,
          homeLocation: { lat: 7.2, lng: 80.1 },
        }),
      );
      await profiles.create(
        profile({
          userId: 'c1',
          nicHash: 'h3',
          district: 'COLOMBO',
          riverBasinId: 'basin-kelani',
          homeLocation: { lat: 6.93, lng: 79.86 },
        }),
      );
      await profiles.create(
        profile({
          userId: 'k1',
          nicHash: 'h4',
          district: 'KALUTARA',
          riverBasinId: 'basin-kalu',
          homeLocation: { lat: 6.58, lng: 79.96 },
        }),
      );
    });

    const ids = (views: { citizenId: string }[]) => views.map((v) => v.citizenId).sort();

    it('finds citizens by district and by river basin', async () => {
      expect(ids(await profiles.findByDistrict('GAMPAHA'))).toEqual(['g1', 'g2']);
      expect(ids(await profiles.findByRiverBasin('basin-kelani'))).toEqual(['c1', 'g1']);
      expect(await profiles.findByDistrict('JAFFNA')).toEqual([]);
    });

    it('finds one citizen by id', async () => {
      expect((await profiles.findById('c1'))?.district).toBe('COLOMBO');
      expect(await profiles.findById('nobody')).toBeNull();
    });

    it('returns only citizens inside a polygon, whether or not the ring is closed', async () => {
      const open: GeoPoint[] = [
        { lat: 7.0, lng: 79.9 },
        { lat: 7.0, lng: 80.2 },
        { lat: 7.3, lng: 80.2 },
        { lat: 7.3, lng: 79.9 },
      ];
      const closed = [...open, open[0] as GeoPoint];

      expect(ids(await profiles.findWithinPolygon(open))).toEqual(['g1', 'g2']);
      expect(ids(await profiles.findWithinPolygon(closed))).toEqual(['g1', 'g2']);
    });

    it('never exposes the NIC fields to other modules', async () => {
      const [view] = await profiles.findByDistrict('COLOMBO');
      const byId = await profiles.findById('c1');

      for (const result of [view, byId]) {
        expect(result).not.toHaveProperty('nicEncrypted');
        expect(result).not.toHaveProperty('nicHash');
        expect(JSON.stringify(result)).not.toContain('iv.tag.cipher');
      }
      expect(view).toMatchObject({
        citizenId: 'c1',
        phone: '+94771234567',
        preferredLanguage: 'SI',
        homeLocation: { lat: 6.93, lng: 79.86 },
        whatsappOptIn: true,
      });
    });
  });
});

describe('MongoRefreshSessionRepository', () => {
  it('inserts and finds a session by token hash with optional fields as undefined', async () => {
    await sessions.insert(session());

    expect(await sessions.findByTokenHash('th-1')).toEqual(session());
    expect(await sessions.findByTokenHash('nope')).toBeNull();
  });

  it('lets exactly one of several simultaneous refreshes rotate a token', async () => {
    await sessions.insert(session());

    const results = await Promise.all([
      sessions.markRotated('s-1', NOW),
      sessions.markRotated('s-1', NOW),
      sessions.markRotated('s-1', NOW),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await sessions.findByTokenHash('th-1'))?.rotatedAt).toEqual(NOW);
  });

  it('refuses to rotate a revoked session', async () => {
    await sessions.insert(session());
    await sessions.revokeFamily('f-1', NOW);

    expect(await sessions.markRotated('s-1', NOW)).toBe(false);
  });

  it('revokes a whole family and nothing else', async () => {
    await sessions.insert(session({ sessionId: 'a', tokenHash: 'ta', familyId: 'f-1' }));
    await sessions.insert(session({ sessionId: 'b', tokenHash: 'tb', familyId: 'f-1' }));
    await sessions.insert(session({ sessionId: 'c', tokenHash: 'tc', familyId: 'f-2' }));

    await sessions.revokeFamily('f-1', NOW);

    expect((await sessions.findByTokenHash('ta'))?.revokedAt).toEqual(NOW);
    expect((await sessions.findByTokenHash('tb'))?.revokedAt).toEqual(NOW);
    expect((await sessions.findByTokenHash('tc'))?.revokedAt).toBeUndefined();
  });

  it('revokes every session of a user across families', async () => {
    await sessions.insert(session({ sessionId: 'a', tokenHash: 'ta', familyId: 'f-1' }));
    await sessions.insert(session({ sessionId: 'b', tokenHash: 'tb', familyId: 'f-2' }));
    await sessions.insert(
      session({ sessionId: 'c', tokenHash: 'tc', familyId: 'f-3', userId: 'someone-else' }),
    );

    await sessions.revokeAllForUser('u-staff', NOW);

    expect((await sessions.findByTokenHash('ta'))?.revokedAt).toEqual(NOW);
    expect((await sessions.findByTokenHash('tb'))?.revokedAt).toEqual(NOW);
    expect((await sessions.findByTokenHash('tc'))?.revokedAt).toBeUndefined();
  });

  it('records a fresh password entry on every live row of the family', async () => {
    await sessions.insert(session({ sessionId: 'a', tokenHash: 'ta' }));
    await sessions.insert(session({ sessionId: 'b', tokenHash: 'tb', familyId: 'f-2' }));
    const later = new Date(NOW.getTime() + 60_000);

    await sessions.touchAuthenticatedAt('f-1', later);

    expect((await sessions.findByTokenHash('ta'))?.authenticatedAt).toEqual(later);
    expect((await sessions.findByTokenHash('tb'))?.authenticatedAt).toEqual(NOW);
  });

  it('cleans up sessions an hour after their hard cap (TTL index)', async () => {
    const indexes = await RefreshSessionModel.collection.indexes();

    expect(
      indexes.some(
        (index) => index.key.absoluteExpiresAt === 1 && index.expireAfterSeconds === 3600,
      ),
    ).toBe(true);
  });
});

describe('MongoLoginThrottleRepository', () => {
  it('counts failures per identifier and forgets them on reset', async () => {
    expect(await throttle.get('login:a@b.lk')).toBeNull();

    await throttle.recordFailure('login:a@b.lk', NOW);
    await throttle.recordFailure('login:a@b.lk', new Date(NOW.getTime() + 1000));

    expect(await throttle.get('login:a@b.lk')).toEqual({
      failures: 2,
      lastFailedAt: new Date(NOW.getTime() + 1000),
    });
    expect(await throttle.get('login:other@b.lk')).toBeNull();

    await throttle.reset('login:a@b.lk');
    expect(await throttle.get('login:a@b.lk')).toBeNull();
  });

  it('stores only a hash of the identifier, so the collection holds no phone numbers or emails', async () => {
    await throttle.recordFailure('login:+94771234567', NOW);

    const [raw] = await LoginThrottleModel.find().lean();

    expect(raw?._id).toBe(createHash('sha256').update('login:+94771234567').digest('hex'));
    expect(JSON.stringify(raw)).not.toContain('94771234567');
  });

  it('forgets an identifier after an hour without failures (TTL index)', async () => {
    const indexes = await LoginThrottleModel.collection.indexes();

    expect(
      indexes.some((index) => index.key.lastFailedAt === 1 && index.expireAfterSeconds === 3600),
    ).toBe(true);
  });
});

describe('MongoRiverBasinLocator', () => {
  const locator = new MongoRiverBasinLocator();
  const basin = (id: string, ring: number[][]) => ({
    _id: id,
    name: id,
    districts: ['GAMPAHA' as const],
    boundary: { type: 'Polygon' as const, coordinates: [ring] },
  });

  beforeEach(async () => {
    await RiverBasinModel.create(
      basin('basin-a', [
        [80, 7],
        [80.2, 7],
        [80.2, 7.2],
        [80, 7.2],
        [80, 7],
      ]),
    );
    await RiverBasinModel.create(
      basin('basin-b', [
        [79.8, 6.4],
        [80, 6.4],
        [80, 6.6],
        [79.8, 6.6],
        [79.8, 6.4],
      ]),
    );
  });

  it('derives the basin a home location falls in', async () => {
    expect(await locator.locate({ lat: 7.1, lng: 80.1 })).toBe('basin-a');
    expect(await locator.locate({ lat: 6.5, lng: 79.9 })).toBe('basin-b');
  });

  it('returns undefined for a location outside every basin', async () => {
    expect(await locator.locate({ lat: 8.5, lng: 81 })).toBeUndefined();
  });

  it('reports no basin when none are stored', async () => {
    await clearDatabase();

    expect(await locator.locate({ lat: 7.1, lng: 80.1 })).toBeUndefined();
  });

  it('indexes the boundary 2dsphere', async () => {
    const indexes = await RiverBasinModel.collection.indexes();

    expect(indexes.some((index) => index.key.boundary === '2dsphere')).toBe(true);
    expect(mongoose.connection.readyState).toBe(1);
  });
});

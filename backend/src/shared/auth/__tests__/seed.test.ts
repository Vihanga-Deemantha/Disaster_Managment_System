import { STAFF_ROLES } from '../../contracts/enums';
import { parseNic, normalizePhone } from '../../contracts/identity';
import { CentroidDistrictLocator } from '../../geo/districts';
import { MongoRiverBasinLocator, RiverBasinModel } from '../../geo/RiverBasin';
import { SequentialIdGenerator } from '../../ids/IdGenerator';
import { nullLogger } from '../../logging/Logger';
import type { SeedContext } from '../../module';
import { clearDatabase, connectTestMongo } from '../../testing/mongo';
import { FixedClock } from '../../time/Clock';
import { AccountProvisioner } from '../application/AccountProvisioner';
import { AesNicProtector } from '../infrastructure/AesNicProtector';
import { MongoCitizenProfileRepository } from '../infrastructure/MongoCitizenProfileRepository';
import { MongoUserRepository } from '../infrastructure/MongoUserRepository';
import { CitizenProfileModel, UserModel } from '../infrastructure/models';
import {
  DEMO_CITIZENS,
  DEMO_ORGANIZATIONS,
  DEMO_RIVER_BASINS,
  DEMO_STAFF,
  seedAuth,
} from '../seed';

let teardown: () => Promise<void>;
const users = new MongoUserRepository();
const profiles = new MongoCitizenProfileRepository();
const clock = new FixedClock();

function context(): SeedContext {
  const nic = new AesNicProtector(Buffer.alloc(32, 1), Buffer.alloc(32, 2));
  return {
    logger: nullLogger,
    clock,
    ids: new SequentialIdGenerator(),
    accounts: new AccountProvisioner(users, profiles, nic, new MongoRiverBasinLocator(), clock),
    users,
    demoPasswordHash: 'demo-password-hash',
  };
}

beforeAll(async () => {
  teardown = await connectTestMongo();
  await Promise.all([UserModel.init(), CitizenProfileModel.init(), RiverBasinModel.init()]);
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());

describe('seedAuth (npm run seed)', () => {
  it('provisions an account for every staff role, plus citizens, a volunteer and two river basins', async () => {
    await seedAuth(context());

    const roles = (await UserModel.find().lean()).map((user) => user.role);
    for (const role of STAFF_ROLES) expect(roles).toContain(role);
    expect(roles.filter((role) => role === 'CITIZEN')).toHaveLength(5);
    expect(roles).toContain('COMMUNITY_VOLUNTEER');
    expect(await RiverBasinModel.countDocuments()).toBe(2);
    expect(await UserModel.countDocuments()).toBe(DEMO_STAFF.length + DEMO_CITIZENS.length);
  });

  it('is safe to run again: nothing is duplicated and nothing throws', async () => {
    await seedAuth(context());
    await seedAuth(context());

    expect(await UserModel.countDocuments()).toBe(DEMO_STAFF.length + DEMO_CITIZENS.length);
    expect(await CitizenProfileModel.countDocuments()).toBe(DEMO_CITIZENS.length);
    expect(await RiverBasinModel.countDocuments()).toBe(2);
  });

  it('does not overwrite an account whose password has since been changed', async () => {
    await seedAuth(context());
    await users.updatePasswordHash('usr-dmc-1', 'changed-by-the-officer');

    await seedAuth(context());

    expect((await users.findById('usr-dmc-1'))?.passwordHash).toBe('changed-by-the-officer');
  });

  it('gives district officers a district and organisation accounts an organisation', async () => {
    await seedAuth(context());

    expect(await users.findByEmail('district.gampaha@safezone.lk')).toMatchObject({
      role: 'DISTRICT_OFFICER',
      district: 'GAMPAHA',
    });
    expect(await users.findByEmail('ngo.manager@safezone.lk')).toMatchObject({
      role: 'NGO_MANAGER',
      organizationId: DEMO_ORGANIZATIONS.redCross.id,
      organizationType: 'NGO',
    });
    expect(await users.findByEmail('dmc.officer@safezone.lk')).toMatchObject({
      district: undefined,
    });
  });

  it('derives river basins for demo citizens from their home location, as registration would', async () => {
    await seedAuth(context());

    const basinOf = async (phone: string) => {
      const user = await users.findByPhone(phone);
      return (await profiles.findByUserId(user!.userId))?.riverBasinId;
    };
    expect(await basinOf('+94770000002')).toBe('basin-kelani'); // Colombo
    expect(await basinOf('+94770000004')).toBe('basin-kalu'); // Kalutara
    expect(await basinOf('+94770000003')).toBe('basin-kalu'); // Ratnapura
  });

  it('stores demo citizens like real ones: encrypted NIC, no plaintext', async () => {
    await seedAuth(context());

    const raw = JSON.stringify(await CitizenProfileModel.find().lean());

    for (const citizen of DEMO_CITIZENS) expect(raw).not.toContain(citizen.nic);
  });
});

describe('demo data sanity', () => {
  it('uses structurally valid, distinct NICs and phone numbers', () => {
    const nics = DEMO_CITIZENS.map((citizen) => parseNic(citizen.nic));
    const phones = DEMO_CITIZENS.map((citizen) => normalizePhone(citizen.phone));

    expect(nics.every((result) => result.ok)).toBe(true);
    expect(phones.every(Boolean)).toBe(true);
    expect(new Set(DEMO_CITIZENS.map((c) => c.nic)).size).toBe(DEMO_CITIZENS.length);
    expect(new Set(phones).size).toBe(DEMO_CITIZENS.length);
  });

  it('places every demo citizen close enough to their district that registration would accept them', () => {
    const locator = new CentroidDistrictLocator();

    for (const citizen of DEMO_CITIZENS) {
      expect(locator.nearest(citizen.homeLocation, 2)).toContain(citizen.district);
    }
  });

  it('gives every account a unique id and email', () => {
    expect(new Set(DEMO_STAFF.map((s) => s.userId)).size).toBe(DEMO_STAFF.length);
    expect(new Set(DEMO_STAFF.map((s) => s.email)).size).toBe(DEMO_STAFF.length);
  });

  it('closes every river basin ring, as GeoJSON requires', () => {
    for (const basin of DEMO_RIVER_BASINS) {
      const ring = basin.boundary.coordinates[0] as number[][];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });
});

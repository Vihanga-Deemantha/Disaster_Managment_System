import { AccountProvisioner } from '@shared/auth/application/AccountProvisioner';
import { AesNicProtector } from '@shared/auth/infrastructure/AesNicProtector';
import { MongoCitizenProfileRepository } from '@shared/auth/infrastructure/MongoCitizenProfileRepository';
import { MongoUserRepository } from '@shared/auth/infrastructure/MongoUserRepository';
import { CitizenProfileModel, UserModel } from '@shared/auth/infrastructure/models';
import { seedAuth } from '@shared/auth/seed';
import { LANGUAGES } from '@shared/contracts/enums';
import { normalizePhone, parseNic } from '@shared/contracts/identity';
import { CentroidDistrictLocator } from '@shared/geo/districts';
import { MongoRiverBasinLocator, RiverBasinModel } from '@shared/geo/RiverBasin';
import { SequentialIdGenerator } from '@shared/ids/IdGenerator';
import { nullLogger } from '@shared/logging/Logger';
import type { SeedContext } from '@shared/module';
import { clearDatabase, connectTestMongo } from '@shared/testing/mongo';
import { FixedClock } from '@shared/time/Clock';
import { TargetArea } from '../../domain/TargetArea';
import { lengthOf, SMS_MAX_LENGTH } from '../../domain/types';
import { Warning } from '../../domain/Warning';
import { MongoCitizenDirectory } from '../../infrastructure/MongoCitizenDirectory';
import { MongoWarningRepository } from '../../infrastructure/MongoWarningRepository';
import { AlertNotificationModel, WarningModel } from '../../infrastructure/models';
import {
  CITIZENS_PER_DISTRICT,
  DEMO_VALIDITY_DAYS,
  DEMO_WARNINGS,
  demoCitizens,
  demoNic,
  demoPhone,
} from '../../seed/demoData';
import { seedWarnings } from '../../seed';

let teardown: () => Promise<void>;
const users = new MongoUserRepository();
const profiles = new MongoCitizenProfileRepository();
const warnings = new MongoWarningRepository();
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

/** What `npm run seed` does: the foundation first (staff, basins), then the use case. */
async function seedEverything(): Promise<void> {
  await seedAuth(context());
  await seedWarnings(context());
}

beforeAll(async () => {
  teardown = await connectTestMongo();
  await Promise.all([
    UserModel.init(),
    CitizenProfileModel.init(),
    RiverBasinModel.init(),
    WarningModel.init(),
    AlertNotificationModel.init(),
  ]);
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());

describe('UC-1 demo data: the 200 citizens', () => {
  const citizens = demoCitizens();

  it('is two hundred people in the five demo districts, as many as the plan says', () => {
    expect(citizens).toHaveLength(200);
    for (const [district, count] of Object.entries(CITIZENS_PER_DISTRICT)) {
      expect(citizens.filter((citizen) => citizen.district === district)).toHaveLength(count);
    }
  });

  it('gives each a structurally valid NIC, a Sri Lankan mobile number, an id and a name of their own', () => {
    expect(citizens.every((citizen) => parseNic(citizen.nic).ok)).toBe(true);
    expect(citizens.every((citizen) => Boolean(normalizePhone(citizen.phone)))).toBe(true);
    for (const field of ['nic', 'phone', 'userId', 'fullName'] as const) {
      expect(new Set(citizens.map((citizen) => citizen[field])).size).toBe(200);
    }
    expect(citizens[0]?.nic).toBe(demoNic(0));
    expect(demoPhone(0)).toBe('0771500001');
    expect(demoPhone(199)).toBe('0771500200');
  });

  it('lives close enough to their district that registration would have accepted them', () => {
    const locator = new CentroidDistrictLocator();

    for (const citizen of citizens) {
      expect(locator.nearest(citizen.homeLocation, 2)).toContain(citizen.district);
    }
  });

  it('is a mix on purpose: channels have something to choose between, and every language appears', () => {
    const withToken = citizens.filter((citizen) => citizen.deviceToken !== undefined);
    const whatsapp = citizens.filter((citizen) => citizen.whatsappOptIn);
    const email = citizens.filter((citizen) => citizen.emailOptIn);

    expect(withToken.length).toBeGreaterThan(100);
    expect(withToken.length).toBeLessThan(200);
    expect(whatsapp.length).toBeGreaterThan(30);
    expect(email.length).toBeGreaterThan(10);
    expect(email.every((citizen) => citizen.email?.endsWith('@example.test'))).toBe(true);
    expect(
      citizens.filter((citizen) => !citizen.emailOptIn).every((c) => c.email === undefined),
    ).toBe(true);
    for (const language of LANGUAGES) {
      expect(citizens.some((citizen) => citizen.preferredLanguage === language)).toBe(true);
    }
  });

  it('gives everyone a phone, since SMS is the channel nobody can opt out of', () => {
    expect(citizens.every((citizen) => citizen.phone.length > 0)).toBe(true);
  });
});

describe('UC-1 demo data: the five pending warnings', () => {
  it('is the five rows of the wireframe, each with its own id', () => {
    expect(DEMO_WARNINGS.map((demo) => demo.area.name)).toEqual([
      'Gampaha',
      'Ratnapura',
      'Kalu Ganga basin',
      'Kelani Ganga basin',
      'Kegalle',
    ]);
    expect(new Set(DEMO_WARNINGS.map((demo) => demo.warningId)).size).toBe(5);
  });

  it('names who submitted each one, with the display name of that very account', () => {
    const names = new Map(DEMO_WARNINGS.map((demo) => [demo.submittedBy, demo.submittedByName]));

    expect(Object.fromEntries(names)).toEqual({
      'usr-duty-1': 'Duty Officer (demo)',
      'usr-dmc-1': 'DMC Officer (demo)',
    });
  });

  it('writes every text in all three languages, and keeps each within one SMS', () => {
    for (const demo of DEMO_WARNINGS) {
      for (const language of LANGUAGES) {
        const text = demo.messages[language].trim();
        expect(text).not.toBe('');
        expect(lengthOf(text)).toBeLessThanOrEqual(SMS_MAX_LENGTH);
      }
    }
  });

  it('can be issued as they stand: every one passes the validation of step 6', () => {
    for (const demo of DEMO_WARNINGS) {
      const warning = Warning.create(
        {
          warningId: demo.warningId,
          hazardType: demo.hazardType,
          severity: demo.severity,
          messages: demo.messages,
          targetAreas: [new TargetArea(demo.area)],
          validFrom: clock.now(),
          validTo: new Date(clock.now().getTime() + DEMO_VALIDITY_DAYS * 86_400_000),
          submittedBy: demo.submittedBy,
        },
        clock.now(),
      );

      expect(warning.validate(clock.now())).toEqual({ ok: true, errors: [] });
    }
  });

  it('hands a DMC Officer one warning to approve, and one of their own, so BR2 can be shown', () => {
    const submitters = DEMO_WARNINGS.map((demo) => demo.submittedBy);

    expect(submitters).toContain('usr-dmc-1');
    expect(submitters.filter((id) => id === 'usr-duty-1')).toHaveLength(4);
  });

  it('draws the two basins from the foundation’s river data, without GeoJSON’s repeated closing point', () => {
    for (const demo of DEMO_WARNINGS.filter((candidate) => candidate.area.type === 'RIVER_BASIN')) {
      expect(demo.area.boundary?.length).toBeGreaterThanOrEqual(3);
      expect(demo.area.boundary?.[0]).not.toEqual(demo.area.boundary?.at(-1));
    }
  });
});

describe('UC-1 demo data: npm run seed', () => {
  it('creates the 200 citizens the way registration does, and the five warnings waiting for approval', async () => {
    await seedAuth(context());
    const before = await CitizenProfileModel.countDocuments();

    await seedWarnings(context());

    expect((await CitizenProfileModel.countDocuments()) - before).toBe(200);
    const pending = await warnings.findByStatus('PENDING_APPROVAL');
    expect(pending.map((warning) => warning.warningId)).toEqual(
      DEMO_WARNINGS.map((demo) => demo.warningId),
    );
  });

  it('stores no plaintext NIC for them', async () => {
    await seedEverything();

    const raw = JSON.stringify(await CitizenProfileModel.find().lean());

    for (const citizen of demoCitizens()) expect(raw).not.toContain(citizen.nic);
  });

  it('is safe to run again: nothing is duplicated and nothing is reset', async () => {
    await seedEverything();
    const [citizenCount, userCount] = await Promise.all([
      CitizenProfileModel.countDocuments(),
      UserModel.countDocuments(),
    ]);
    const edited = (await warnings.findById('warning-demo-gampaha'))!;
    edited.update({ severity: 'LOW' }, clock.now());
    await warnings.save(edited, 1);

    await seedWarnings(context());

    expect(await CitizenProfileModel.countDocuments()).toBe(citizenCount);
    expect(await UserModel.countDocuments()).toBe(userCount);
    expect(await WarningModel.countDocuments()).toBe(5);
    expect((await warnings.findById('warning-demo-gampaha'))?.severity).toBe('LOW');
  });

  it('lists them newest first, a few minutes apart, as in the wireframe', async () => {
    await seedEverything();

    const submitted = (await warnings.findByStatus()).map((warning) =>
      warning.snapshot().submittedAt.getTime(),
    );

    expect(submitted).toEqual([0, 1, 2, 3, 4].map((n) => clock.now().getTime() - n * 7 * 60_000));
  });

  it('stores who submitted each warning by name', async () => {
    await seedEverything();

    const names = (await warnings.findByStatus()).map(
      (warning) => warning.snapshot().submittedByName,
    );

    expect(names.sort()).toEqual([
      'DMC Officer (demo)',
      'Duty Officer (demo)',
      'Duty Officer (demo)',
      'Duty Officer (demo)',
      'Duty Officer (demo)',
    ]);
  });

  it('gives a warning seeded before names existed its name, and changes nothing else about it', async () => {
    await seedEverything();
    await WarningModel.updateOne(
      { _id: 'warning-demo-gampaha' },
      { $unset: { submittedByName: 1 } },
    );
    const before = (await warnings.findById('warning-demo-gampaha'))!.snapshot();
    expect(before.submittedByName).toBeUndefined();

    await seedWarnings(context());

    const after = (await warnings.findById('warning-demo-gampaha'))!.snapshot();
    expect(after).toEqual({ ...before, submittedByName: 'Duty Officer (demo)' });
  });

  it('does not overwrite a name that is already there', async () => {
    await seedEverything();
    await WarningModel.updateOne({ _id: 'warning-demo-gampaha' }, { submittedByName: 'Renamed' });

    await seedWarnings(context());

    expect((await warnings.findById('warning-demo-gampaha'))?.snapshot().submittedByName).toBe(
      'Renamed',
    );
  });

  it('keeps every demo warning valid for a month, so a database seeded days before the viva still works', async () => {
    await seedEverything();

    for (const warning of await warnings.findByStatus()) {
      const { validFrom, validTo } = warning.snapshot();
      expect(validTo.getTime() - validFrom.getTime()).toBe(DEMO_VALIDITY_DAYS * 86_400_000);
      expect(warning.validate(clock.now()).ok).toBe(true);
    }
  });

  it('leaves nobody without an audience: every warning has recipients waiting in its area', async () => {
    await seedEverything();
    const directory = new MongoCitizenDirectory(profiles);

    const audience: Record<string, number> = {};
    for (const warning of await warnings.findByStatus()) {
      const found = new Set<string>();
      for (const area of warning.targetAreas) {
        for (const recipient of await area.findCitizens(directory)) found.add(recipient.citizenId);
      }
      audience[warning.warningId] = found.size;
    }

    expect(audience['warning-demo-gampaha']).toBeGreaterThanOrEqual(60);
    expect(audience['warning-demo-ratnapura']).toBeGreaterThanOrEqual(30);
    expect(audience['warning-demo-kegalle']).toBeGreaterThanOrEqual(30);
    expect(audience['warning-demo-kalutara']).toBeGreaterThan(0);
    expect(audience['warning-demo-colombo']).toBeGreaterThan(0);
  });
});

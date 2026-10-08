import type { CitizenProfileView } from '@shared/auth';
import { FakeCitizenProfileReader } from '@shared/testing/FakeCitizenProfileReader';
import { MongoCitizenDirectory } from '../../infrastructure/MongoCitizenDirectory';
import { aTargetArea } from '../../testing/builders';

const view = (overrides: Partial<CitizenProfileView> = {}): CitizenProfileView => ({
  citizenId: 'c-1',
  fullName: 'Test Citizen',
  phone: '+94771234567',
  homeLocation: { lat: 7.0873, lng: 79.9925 },
  district: 'GAMPAHA',
  preferredLanguage: 'EN',
  whatsappOptIn: false,
  emailOptIn: false,
  ...overrides,
});

const directory = () =>
  new MongoCitizenDirectory(
    new FakeCitizenProfileReader(
      view({ citizenId: 'gampaha-1' }),
      view({ citizenId: 'gampaha-2', riverBasinId: 'basin-kelani' }),
      view({ citizenId: 'colombo-1', district: 'COLOMBO', riverBasinId: 'basin-kelani' }),
      view({ citizenId: 'kandy-1', district: 'KANDY' }),
    ),
  );

describe('UC-1 step 8 / UCD-12a / SD1-03: MongoCitizenDirectory.findInArea', () => {
  it('UC-1 step 8: finds everyone registered in a district, and nobody from another', async () => {
    const found = await directory().findInArea(aTargetArea());

    expect(found.map((r) => r.citizenId)).toEqual(['gampaha-1', 'gampaha-2']);
  });

  it('UC-1 step 8: finds everyone in a river basin, across districts', async () => {
    const found = await directory().findInArea(
      aTargetArea({ areaId: 'basin-kelani', type: 'RIVER_BASIN', name: 'Kelani Ganga' }),
    );

    expect(found.map((r) => r.citizenId)).toEqual(['gampaha-2', 'colombo-1']);
  });

  it('UC-1 step 8: a basin is matched by its id, not by the district named on the area', async () => {
    const found = await directory().findInArea(
      aTargetArea({
        areaId: 'basin-kelani',
        type: 'RIVER_BASIN',
        name: 'Kelani Ganga',
        district: 'KANDY',
      }),
    );

    expect(found.map((r) => r.citizenId)).toEqual(['gampaha-2', 'colombo-1']);
  });

  it('UC-1 step 8: says nobody when the area is empty', async () => {
    const found = await directory().findInArea(
      aTargetArea({ areaId: 'JAFFNA', district: 'JAFFNA' }),
    );

    expect(found).toEqual([]);
  });

  it('UC-1 step 9: hands back recipients, who carry no NIC at all', async () => {
    const [first] = await directory().findInArea(aTargetArea());

    expect(first).toMatchObject({
      citizenId: 'gampaha-1',
      fullName: 'Test Citizen',
      preferredLanguage: 'EN',
      phone: '+94771234567',
    });
    expect(Object.keys(first as object)).not.toContain('nic');
    expect(JSON.stringify(first)).not.toMatch(/nic/i);
  });
});

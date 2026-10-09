import type { District, Language } from '@shared/contracts/enums';
import { normalizePhone } from '@shared/contracts/identity';
import { DISTRICT_CENTROIDS } from '@shared/geo/districts';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import { DEMO_ORGANIZATIONS } from '@shared/auth/seed/demoAccounts';
import type { SeedContext } from '@shared/module';
import { demoNic } from '../../modules/warnings/seed/demoData';

/** Staff the base seed does not have: a second Duty Officer and a District Officer for the two other demo districts. */
const EXTRA_STAFF = [
  {
    userId: 'usr-duty-2',
    role: 'DUTY_OFFICER',
    displayName: 'Duty Officer 2 (demo)',
    email: 'duty.officer2@safezone.lk',
  },
  {
    userId: 'usr-district-kalutara',
    role: 'DISTRICT_OFFICER',
    displayName: 'District Officer Kalutara (demo)',
    email: 'district.kalutara@safezone.lk',
    district: 'KALUTARA',
  },
  {
    userId: 'usr-district-kegalle',
    role: 'DISTRICT_OFFICER',
    displayName: 'District Officer Kegalle (demo)',
    email: 'district.kegalle@safezone.lk',
    district: 'KEGALLE',
  },
] as const;

interface VolunteerSeed {
  name: string;
  district: District;
  language: Language;
  /** Has the app installed (a device token), so a warning reaches them by push as well as SMS. */
  hasApp: boolean;
  /** Metres north and east of the district centre. */
  offset: [number, number];
}

const VOLUNTEERS: readonly VolunteerSeed[] = [
  {
    name: 'Demo Volunteer Gampaha',
    district: 'GAMPAHA',
    language: 'SI',
    hasApp: true,
    offset: [1800, 1200],
  },
  {
    name: 'Demo Volunteer Colombo North',
    district: 'COLOMBO',
    language: 'EN',
    hasApp: true,
    offset: [2400, -900],
  },
  {
    name: 'Demo Volunteer Ratnapura',
    district: 'RATNAPURA',
    language: 'SI',
    hasApp: true,
    offset: [-1500, 2100],
  },
  {
    name: 'Demo Volunteer Kegalle',
    district: 'KEGALLE',
    language: 'TA',
    hasApp: false,
    offset: [900, -1700],
  },
  {
    name: 'Demo Volunteer Kalutara',
    district: 'KALUTARA',
    language: 'EN',
    hasApp: true,
    offset: [-2000, 1000],
  },
  {
    name: 'Demo Volunteer Colombo South',
    district: 'COLOMBO',
    language: 'TA',
    hasApp: false,
    offset: [-2600, 800],
  },
];

/** The volunteers' ids, in the order above, for the scenarios that name a reporter. */
export const VOLUNTEER_IDS = VOLUNTEERS.map((_, index) => `usr-demo-volunteer-${index + 1}`);

const METRES_PER_DEGREE = 111_195;

function homeOf(district: District, [north, east]: [number, number]): GeoPoint {
  const centre = DISTRICT_CENTROIDS[district];
  return {
    lat: centre.lat + north / METRES_PER_DEGREE,
    lng: centre.lng + east / (METRES_PER_DEGREE * Math.cos((centre.lat * Math.PI) / 180)),
  };
}

export interface AccountsSummary {
  staff: number;
  volunteers: number;
}

/**
 * The people the base seed lacks. Volunteers are created exactly like a real registration (encrypted NIC,
 * derived river basin); staff are provisioned. Anyone who already exists is left alone.
 */
export async function seedExtraAccounts(ctx: SeedContext): Promise<AccountsSummary> {
  const summary = { staff: 0, volunteers: 0 };
  for (const staff of EXTRA_STAFF) {
    if (await ctx.users.findByEmail(staff.email)) continue;
    await ctx.accounts.createStaff({ ...staff, passwordHash: ctx.demoPasswordHash });
    summary.staff += 1;
  }
  for (const [index, volunteer] of VOLUNTEERS.entries()) {
    const phone = normalizePhone(`07721${String(index + 1).padStart(5, '0')}`) as string;
    if (await ctx.users.findByPhone(phone)) continue;
    await ctx.accounts.createCitizen({
      userId: VOLUNTEER_IDS[index] as string,
      role: 'COMMUNITY_VOLUNTEER',
      nic: demoNic(300 + index),
      fullName: volunteer.name,
      phone,
      addressLine: `${index + 1} Volunteer Lane, ${volunteer.district.charAt(0)}${volunteer.district.slice(1).toLowerCase()}`,
      district: volunteer.district,
      homeLocation: homeOf(volunteer.district, volunteer.offset),
      preferredLanguage: volunteer.language,
      ...(volunteer.hasApp ? { deviceToken: `demo-device-token-volunteer-${index + 1}` } : {}),
      whatsappOptIn: index % 2 === 0,
      emailOptIn: false,
      passwordHash: ctx.demoPasswordHash,
    });
    summary.volunteers += 1;
  }
  return summary;
}

/** Who owns what stays as the base seed has it; this only names the organisations the extra shelters belong to. */
export const SHELTER_OWNER = DEMO_ORGANIZATIONS.redCross;

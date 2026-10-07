import type { District, OrganizationType, Role } from '../../contracts/enums';
import type { CitizenSpec } from '../application/AccountProvisioner';
import type { RiverBasinDoc } from '../../geo/RiverBasin';

/**
 * Demo accounts for development and the viva. Staff are provisioned here only: staff never
 * self-register (master plan §7.1.1), and there are no admin screens. The shared demo password is
 * overridable with SEED_PASSWORD, and the seed script refuses to run in production.
 */
export const DEFAULT_DEMO_PASSWORD = 'SafeZone#Demo2026';

/** Stable ids so UC-2 / UC-4 seeds can reference the same organisations. */
export const DEMO_ORGANIZATIONS = {
  redCross: { id: 'org-red-cross', type: 'NGO' },
  army: { id: 'org-sl-army', type: 'ARMED_FORCES' },
  irrigation: { id: 'org-irrigation-dept', type: 'GOVERNMENT' },
  foundation: { id: 'org-relief-foundation', type: 'PRIVATE_DONOR' },
} as const satisfies Record<string, { id: string; type: OrganizationType }>;

interface StaffSeed {
  userId: string;
  role: Role;
  displayName: string;
  email: string;
  district?: District;
  organization?: { id: string; type: OrganizationType };
}

export const DEMO_STAFF: readonly StaffSeed[] = [
  {
    userId: 'usr-dmc-1',
    role: 'DMC_OFFICER',
    displayName: 'DMC Officer (demo)',
    email: 'dmc.officer@safezone.lk',
  },
  {
    userId: 'usr-dmc-2',
    role: 'DMC_OFFICER',
    displayName: 'DMC Officer 2 (demo)',
    email: 'dmc.officer2@safezone.lk',
  },
  {
    userId: 'usr-duty-1',
    role: 'DUTY_OFFICER',
    displayName: 'Duty Officer (demo)',
    email: 'duty.officer@safezone.lk',
  },
  {
    userId: 'usr-district-gampaha',
    role: 'DISTRICT_OFFICER',
    displayName: 'District Officer Gampaha (demo)',
    email: 'district.gampaha@safezone.lk',
    district: 'GAMPAHA',
  },
  {
    userId: 'usr-district-colombo',
    role: 'DISTRICT_OFFICER',
    displayName: 'District Officer Colombo (demo)',
    email: 'district.colombo@safezone.lk',
    district: 'COLOMBO',
  },
  {
    userId: 'usr-district-ratnapura',
    role: 'DISTRICT_OFFICER',
    displayName: 'District Officer Ratnapura (demo)',
    email: 'district.ratnapura@safezone.lk',
    district: 'RATNAPURA',
  },
  {
    userId: 'usr-ngo-1',
    role: 'NGO_MANAGER',
    displayName: 'NGO Manager (demo)',
    email: 'ngo.manager@safezone.lk',
    organization: DEMO_ORGANIZATIONS.redCross,
  },
  {
    userId: 'usr-forces-1',
    role: 'ARMED_FORCES_LIAISON',
    displayName: 'Armed Forces Liaison (demo)',
    email: 'forces.liaison@safezone.lk',
    organization: DEMO_ORGANIZATIONS.army,
  },
  {
    userId: 'usr-agency-1',
    role: 'GOVERNMENT_AGENCY_OFFICER',
    displayName: 'Government Agency Officer (demo)',
    email: 'agency.officer@safezone.lk',
    organization: DEMO_ORGANIZATIONS.irrigation,
  },
  {
    userId: 'usr-donor-1',
    role: 'DONOR',
    displayName: 'Donor (demo)',
    email: 'donor@safezone.lk',
    organization: DEMO_ORGANIZATIONS.foundation,
  },
];

type CitizenSeed = Pick<
  CitizenSpec,
  'userId' | 'role' | 'nic' | 'fullName' | 'district' | 'preferredLanguage' | 'homeLocation'
> & {
  phone: string;
  addressLine: string;
  deviceToken?: string;
  whatsappOptIn?: boolean;
  email?: string;
  emailOptIn?: boolean;
};

/**
 * Obviously fictional people with structurally valid but made-up NICs and phone numbers. A mix of
 * languages, devices and opt-ins so UC-1's channel selection has something to choose between.
 */
export const DEMO_CITIZENS: readonly CitizenSeed[] = [
  {
    userId: 'usr-citizen-1',
    role: 'CITIZEN',
    nic: '199001234567',
    fullName: 'Demo Citizen Gampaha',
    phone: '0770000001',
    addressLine: '12 Temple Road, Gampaha',
    district: 'GAMPAHA',
    preferredLanguage: 'SI',
    homeLocation: { lat: 7.0873, lng: 79.9925 },
    deviceToken: 'demo-device-token-1',
    whatsappOptIn: true,
  },
  {
    userId: 'usr-citizen-2',
    role: 'CITIZEN',
    nic: '198512345678',
    fullName: 'Demo Citizen Colombo',
    phone: '0770000002',
    addressLine: '5 Galle Road, Colombo 03',
    district: 'COLOMBO',
    preferredLanguage: 'EN',
    homeLocation: { lat: 6.9271, lng: 79.8612 },
    deviceToken: 'demo-device-token-2',
    email: 'demo.colombo@example.com',
    emailOptIn: true,
  },
  {
    userId: 'usr-citizen-3',
    role: 'CITIZEN',
    nic: '853400937V',
    fullName: 'Demo Citizen Ratnapura',
    phone: '0770000003',
    addressLine: '8 Main Street, Ratnapura',
    district: 'RATNAPURA',
    preferredLanguage: 'SI',
    homeLocation: { lat: 6.6828, lng: 80.3992 },
  },
  {
    userId: 'usr-citizen-4',
    role: 'CITIZEN',
    nic: '200112300012',
    fullName: 'Demo Citizen Kalutara',
    phone: '0770000004',
    addressLine: '3 Beach Road, Kalutara',
    district: 'KALUTARA',
    preferredLanguage: 'TA',
    homeLocation: { lat: 6.5854, lng: 79.9607 },
    deviceToken: 'demo-device-token-4',
    whatsappOptIn: true,
  },
  {
    userId: 'usr-citizen-5',
    role: 'CITIZEN',
    nic: '199563000123',
    fullName: 'Demo Citizen Kegalle',
    phone: '0770000005',
    addressLine: '21 Hill Street, Kegalle',
    district: 'KEGALLE',
    preferredLanguage: 'SI',
    homeLocation: { lat: 7.2513, lng: 80.3464 },
    deviceToken: 'demo-device-token-5',
  },
  {
    userId: 'usr-volunteer-1',
    role: 'COMMUNITY_VOLUNTEER',
    nic: '905200451V',
    fullName: 'Demo Volunteer Colombo',
    phone: '0770000006',
    addressLine: '9 Lake Drive, Colombo 07',
    district: 'COLOMBO',
    preferredLanguage: 'EN',
    homeLocation: { lat: 6.9147, lng: 79.8678 },
    deviceToken: 'demo-device-token-6',
  },
];

/**
 * Rough demo boundaries (not survey data) for the two flood-prone basins around Colombo and
 * Ratnapura, so a citizen's river basin can be derived when they register. UC-1 may refine them.
 */
const ring = (points: [number, number][]): number[][][] => [
  [...points, points[0] as [number, number]],
];
export const DEMO_RIVER_BASINS: readonly RiverBasinDoc[] = [
  {
    _id: 'basin-kelani',
    name: 'Kelani Ganga (demo boundary)',
    districts: ['COLOMBO', 'GAMPAHA', 'KEGALLE', 'RATNAPURA', 'NUWARA_ELIYA'],
    boundary: {
      type: 'Polygon',
      coordinates: ring([
        [80.45, 6.75],
        [80.65, 6.9],
        [80.6, 7.15],
        [80.42, 7.28],
        [80.15, 7.2],
        [79.97, 7.08],
        [79.84, 6.96],
        [79.85, 6.88],
        [80.05, 6.84],
        [80.25, 6.78],
      ]),
    },
  },
  {
    _id: 'basin-kalu',
    name: 'Kalu Ganga (demo boundary)',
    districts: ['KALUTARA', 'RATNAPURA'],
    boundary: {
      type: 'Polygon',
      coordinates: ring([
        [79.9, 6.38],
        [79.85, 6.55],
        [80.1, 6.68],
        [80.4, 6.75],
        [80.62, 6.72],
        [80.6, 6.58],
        [80.35, 6.45],
        [80.05, 6.35],
      ]),
    },
  },
];

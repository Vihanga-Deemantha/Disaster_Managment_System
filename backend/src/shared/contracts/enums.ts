/**
 * Cross-module enums. FROZEN after the foundation commit: changes need a PR approved by all four members.
 *
 * Pure TypeScript with no Node imports, because the frontend imports this folder through the
 * `@contracts` alias.
 */

export const ROLES = [
  'CITIZEN',
  'COMMUNITY_VOLUNTEER',
  'DUTY_OFFICER',
  'DMC_OFFICER',
  'DISTRICT_OFFICER',
  'NGO_MANAGER',
  'ARMED_FORCES_LIAISON',
  'GOVERNMENT_AGENCY_OFFICER',
  'DONOR',
] as const;
export type Role = (typeof ROLES)[number];

/** Roles that register themselves through the public form. */
export const PUBLIC_ROLES = ['CITIZEN', 'COMMUNITY_VOLUNTEER'] as const satisfies readonly Role[];

/** Roles that exist only because the seed script provisioned them (master plan §7.1.1). */
export const STAFF_ROLES = [
  'DUTY_OFFICER',
  'DMC_OFFICER',
  'DISTRICT_OFFICER',
  'NGO_MANAGER',
  'ARMED_FORCES_LIAISON',
  'GOVERNMENT_AGENCY_OFFICER',
  'DONOR',
] as const satisfies readonly Role[];

export const isStaffRole = (role: Role): boolean => (STAFF_ROLES as readonly Role[]).includes(role);

export const DISTRICTS = [
  'AMPARA',
  'ANURADHAPURA',
  'BADULLA',
  'BATTICALOA',
  'COLOMBO',
  'GALLE',
  'GAMPAHA',
  'HAMBANTOTA',
  'JAFFNA',
  'KALUTARA',
  'KANDY',
  'KEGALLE',
  'KILINOCHCHI',
  'KURUNEGALA',
  'MANNAR',
  'MATALE',
  'MATARA',
  'MONARAGALA',
  'MULLAITIVU',
  'NUWARA_ELIYA',
  'POLONNARUWA',
  'PUTTALAM',
  'RATNAPURA',
  'TRINCOMALEE',
  'VAVUNIYA',
] as const;
export type District = (typeof DISTRICTS)[number];

export const DISTRICT_LABELS: Record<District, string> = {
  AMPARA: 'Ampara',
  ANURADHAPURA: 'Anuradhapura',
  BADULLA: 'Badulla',
  BATTICALOA: 'Batticaloa',
  COLOMBO: 'Colombo',
  GALLE: 'Galle',
  GAMPAHA: 'Gampaha',
  HAMBANTOTA: 'Hambantota',
  JAFFNA: 'Jaffna',
  KALUTARA: 'Kalutara',
  KANDY: 'Kandy',
  KEGALLE: 'Kegalle',
  KILINOCHCHI: 'Kilinochchi',
  KURUNEGALA: 'Kurunegala',
  MANNAR: 'Mannar',
  MATALE: 'Matale',
  MATARA: 'Matara',
  MONARAGALA: 'Monaragala',
  MULLAITIVU: 'Mullaitivu',
  NUWARA_ELIYA: 'Nuwara Eliya',
  POLONNARUWA: 'Polonnaruwa',
  PUTTALAM: 'Puttalam',
  RATNAPURA: 'Ratnapura',
  TRINCOMALEE: 'Trincomalee',
  VAVUNIYA: 'Vavuniya',
};

export const LANGUAGES = ['SI', 'TA', 'EN'] as const;
export type Language = (typeof LANGUAGES)[number];

export const AREA_TYPES = ['DISTRICT', 'RIVER_BASIN'] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const CHANNELS = ['PUSH', 'SMS', 'WHATSAPP', 'EMAIL'] as const;
export type Channel = (typeof CHANNELS)[number];

export const ORGANIZATION_TYPES = ['GOVERNMENT', 'ARMED_FORCES', 'NGO', 'PRIVATE_DONOR'] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

/** Provisional: confirm against the report's class diagram (Section 2.6) before modules depend on it. */
export const HAZARD_TYPES = [
  'FLOOD',
  'LANDSLIDE',
  'CYCLONE',
  'TSUNAMI',
  'DROUGHT',
  'LIGHTNING',
] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

/** Provisional: confirm against the report's class diagram (Section 2.6) before modules depend on it. */
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

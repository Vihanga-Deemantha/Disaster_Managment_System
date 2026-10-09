/**
 * The values the API and the web app share, copied from `backend/src/shared/contracts/enums.ts`.
 * The mobile app is not one of the npm workspaces, so it cannot import that folder; the parity test
 * (`__tests__/contracts.parity.test.ts`) fails when the two lists drift apart.
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

/** The only roles that sign in on a phone; every other role works on the web dashboard. */
export const PUBLIC_ROLES = ['CITIZEN', 'COMMUNITY_VOLUNTEER'] as const satisfies readonly Role[];

export const isPublicRole = (role: Role): boolean =>
  (PUBLIC_ROLES as readonly Role[]).includes(role);

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

export const LANGUAGES = ['SI', 'TA', 'EN'] as const;
export type Language = (typeof LANGUAGES)[number];

export const AREA_TYPES = ['DISTRICT', 'RIVER_BASIN'] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const HAZARD_TYPES = [
  'FLOOD',
  'LANDSLIDE',
  'CYCLONE',
  'TSUNAMI',
  'DROUGHT',
  'LIGHTNING',
  'ROAD_BLOCKAGE',
  'OTHER',
] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

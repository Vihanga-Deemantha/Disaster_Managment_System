import type { Role } from '@contracts/enums';

/** Where each kind of user lands after signing in. Everyone can still reach any screen their role allows. */
const HOME: Record<Role, string> = {
  CITIZEN: '/hazard-reports',
  COMMUNITY_VOLUNTEER: '/hazard-reports',
  DUTY_OFFICER: '/hazard-reports',
  DMC_OFFICER: '/warnings',
  DISTRICT_OFFICER: '/resources',
  NGO_MANAGER: '/resources',
  ARMED_FORCES_LIAISON: '/resources',
  GOVERNMENT_AGENCY_OFFICER: '/resources',
  DONOR: '/analytics',
};

export const homePathFor = (role: Role): string => HOME[role];

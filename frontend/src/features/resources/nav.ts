import type { NavItem } from '@/shared/layout/navigation';

/** UC-2 sidebar entry. Adjust `roles` to match the report (District Officer plus the resource owners). */
export const resourcesNav: NavItem = {
  id: 'resources',
  labelKey: 'nav.resources',
  to: '/resources',
  roles: [
    'DISTRICT_OFFICER',
    'DMC_OFFICER',
    'NGO_MANAGER',
    'ARMED_FORCES_LIAISON',
    'GOVERNMENT_AGENCY_OFFICER',
  ],
};

import type { NavItem } from '@/shared/layout/navigation';

/** UC-3 sidebar entry. Citizens and volunteers submit reports; duty officers verify them. */
export const hazardReportsNav: NavItem = {
  id: 'hazard-reports',
  labelKey: 'nav.hazardReports',
  to: '/hazard-reports',
  roles: ['CITIZEN', 'COMMUNITY_VOLUNTEER', 'DUTY_OFFICER'],
};

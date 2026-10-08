import type { NavItem } from '@/shared/layout/navigation';

/** UC-3 sidebar entry. Citizens and volunteers submit reports; duty and DMC officers verify them. */
export const hazardReportsNav: NavItem = {
  id: 'hazard-reports',
  labelKey: 'nav.hazardReports',
  to: '/hazard-reports',
  roles: ['CITIZEN', 'COMMUNITY_VOLUNTEER', 'DUTY_OFFICER', 'DMC_OFFICER'],
};

export const hazardDashboardNav: NavItem = {
  ...hazardReportsNav,
  id: 'hazard-dashboard',
  labelKey: 'hazardReports.nav.dashboard',
  roles: ['DUTY_OFFICER', 'DMC_OFFICER'],
  icon: 'clipboardList',
};

export const hazardReviewNav: NavItem = {
  id: 'hazard-review',
  labelKey: 'hazardReports.review.title',
  to: '/hazard-reports/reports',
  roles: ['DUTY_OFFICER', 'DMC_OFFICER'],
  icon: 'shieldCheck',
};

export const hazardHistoryNav: NavItem = {
  id: 'hazard-history',
  labelKey: 'hazardReports.history.title',
  to: '/hazard-reports/history',
  roles: ['DUTY_OFFICER', 'DMC_OFFICER'],
  icon: 'fileText',
};

export const hazardReporterNav: NavItem = {
  ...hazardReportsNav,
  roles: ['CITIZEN', 'COMMUNITY_VOLUNTEER'],
  icon: 'clipboardList',
};

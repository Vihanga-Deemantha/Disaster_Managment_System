import type { NavItem } from '@/shared/layout/navigation';

/** UC-4 sidebar entry. DMC Officers see everything; NGO Managers and Donors see their organisation. */
export const analyticsNav: NavItem = {
  id: 'analytics',
  labelKey: 'nav.analytics',
  to: '/analytics',
  roles: ['DMC_OFFICER', 'NGO_MANAGER', 'DONOR'],
};

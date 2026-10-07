import type { NavItem } from '@/shared/layout/navigation';

/** UC-1 sidebar entry. Adjust `roles` to match the report (who may open Pending Approvals). */
export const warningsNav: NavItem = {
  id: 'warnings',
  labelKey: 'nav.warnings',
  to: '/warnings',
  roles: ['DMC_OFFICER'],
};

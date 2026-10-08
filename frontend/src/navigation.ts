import type { NavGroup, NavItem } from '@/shared/layout/navigation';
import type { IconName } from '@/shared/ui/Icon';
import { analyticsNav } from '@/features/analytics/nav';
import {
  hazardDashboardNav,
  hazardReviewNav,
  hazardHistoryNav,
  hazardReporterNav,
} from '@/features/hazard-reports/nav';
import { resourcesNav } from '@/features/resources/nav';
import { warningsIssuedNav, warningsNav, warningsRejectedNav } from '@/features/warnings/nav';

/** An entry's own icon wins; this only gives the entries that did not choose one a sensible default. */
const withIcon = (item: NavItem, icon: IconName): NavItem => ({ icon, ...item });

/**
 * The single sidebar for every module, grouped Warnings / Coordination / Analysis (report HCI-01).
 * Each use case contributes its entry from its own `nav.ts`; this file only groups them.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'warnings',
    labelKey: 'nav.group.warnings',
    items: [warningsNav, warningsIssuedNav, warningsRejectedNav],
  },
  {
    id: 'coordination',
    labelKey: 'nav.group.coordination',
    items: [
      hazardDashboardNav,
      hazardReviewNav,
      hazardHistoryNav,
      hazardReporterNav,
      withIcon(resourcesNav, 'package'),
    ],
  },
  { id: 'analysis', labelKey: 'nav.group.analysis', items: [withIcon(analyticsNav, 'barChart')] },
];

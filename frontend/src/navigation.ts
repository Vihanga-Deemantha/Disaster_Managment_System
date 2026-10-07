import type { NavGroup } from '@/shared/layout/navigation';
import { analyticsNav } from '@/features/analytics/nav';
import { hazardReportsNav } from '@/features/hazard-reports/nav';
import { resourcesNav } from '@/features/resources/nav';
import { warningsNav } from '@/features/warnings/nav';

/**
 * The single sidebar for every module, grouped Warnings / Coordination / Analysis (report HCI-01).
 * Each use case contributes its entry from its own `nav.ts`; this file only groups them.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'warnings', labelKey: 'nav.group.warnings', items: [warningsNav] },
  {
    id: 'coordination',
    labelKey: 'nav.group.coordination',
    items: [hazardReportsNav, resourcesNav],
  },
  { id: 'analysis', labelKey: 'nav.group.analysis', items: [analyticsNav] },
];
